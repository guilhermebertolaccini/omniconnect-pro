// Shared audit logging helper used by edge functions to write to public.audit_logs.
// All writes use the service role client to bypass RLS.

export type AuditCategory =
  | 'oauth' | 'token' | 'api_call' | 'webhook' | 'permission' | 'config';
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AuditActorType = 'user' | 'system' | 'webhook' | 'cron';
export type AuditPlatform = 'meta' | 'google_ads' | 'tiktok_ads' | null;

export interface AuditEntry {
  agency_id?: string | null;
  company_id?: string | null;
  actor_user_id?: string | null;
  actor_type?: AuditActorType;
  category: AuditCategory;
  action: string;
  platform?: AuditPlatform;
  severity?: AuditSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

// Resolve agency_id when only company_id is known. Cached per request.
async function resolveAgencyId(serviceClient: any, companyId: string | null | undefined) {
  if (!companyId) return null;
  const { data } = await serviceClient
    .from('companies')
    .select('agency_id')
    .eq('id', companyId)
    .maybeSingle();
  return data?.agency_id ?? null;
}

export async function logAudit(serviceClient: any, entry: AuditEntry) {
  try {
    let agencyId = entry.agency_id ?? null;
    if (!agencyId && entry.company_id) {
      agencyId = await resolveAgencyId(serviceClient, entry.company_id);
    }
    // Fallback to internal default agency to avoid losing the log entirely.
    if (!agencyId) agencyId = '00000000-0000-0000-0000-000000000001';

    await serviceClient.from('audit_logs').insert({
      agency_id: agencyId,
      company_id: entry.company_id ?? null,
      actor_user_id: entry.actor_user_id ?? null,
      actor_type: entry.actor_type ?? 'system',
      category: entry.category,
      action: entry.action,
      platform: entry.platform ?? null,
      severity: entry.severity ?? 'info',
      message: entry.message,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    console.error('[audit] failed to log:', err, entry);
  }
}

// Classify a platform API error and emit the right audit entry.
// Returns true if the call should also mark the connection inactive.
export interface ClassifyContext {
  serviceClient: any;
  company_id: string;
  actor_user_id?: string | null;
  actor_type?: AuditActorType;
  platform: 'meta' | 'google_ads' | 'tiktok_ads';
  endpoint?: string;
  http_status?: number;
}

export async function classifyAndLogPlatformError(
  ctx: ClassifyContext,
  errorPayload: any,
): Promise<{ tokenInvalid: boolean }> {
  let category: AuditCategory = 'api_call';
  let action = 'api.error';
  let severity: AuditSeverity = 'error';
  let message = 'Falha na chamada à API';
  let tokenInvalid = false;

  if (ctx.platform === 'meta') {
    const e = errorPayload?.error ?? errorPayload;
    const code = e?.code;
    const subcode = e?.error_subcode;
    if (code === 190) {
      category = 'token'; action = 'token.expired'; severity = 'critical';
      message = e?.message || 'Token Meta inválido/expirado';
      tokenInvalid = true;
    } else if (code === 200 || code === 10 || code === 100) {
      category = 'permission'; action = 'permission.denied'; severity = 'error';
      message = e?.message || 'Permissão insuficiente na API Meta';
    } else if (e?.message) {
      message = e.message;
    }
    return await emit({ ...ctx, category, action, severity, message,
      metadata: { code, subcode, fbtrace_id: e?.fbtrace_id, type: e?.type, raw: e }
    }, tokenInvalid);
  }

  if (ctx.platform === 'google_ads') {
    const e = errorPayload?.error ?? errorPayload;
    const status = e?.status;
    if (status === 'UNAUTHENTICATED') {
      category = 'token'; action = 'token.expired'; severity = 'critical';
      tokenInvalid = true;
      message = 'Token Google Ads inválido/expirado';
    } else if (status === 'PERMISSION_DENIED') {
      category = 'permission'; action = 'permission.denied'; severity = 'error';
      message = e?.message || 'Permissão insuficiente no Google Ads';
    } else if (e?.message) {
      message = e.message;
    }
    return await emit({ ...ctx, category, action, severity, message,
      metadata: { status, code: e?.code, raw: e }
    }, tokenInvalid);
  }

  if (ctx.platform === 'tiktok_ads') {
    const code = errorPayload?.code;
    if (code === 40105 || code === 40000) {
      category = 'token'; action = 'token.expired'; severity = 'critical';
      tokenInvalid = true;
      message = errorPayload?.message || 'Token TikTok inválido/expirado';
    } else if (code && code !== 0) {
      message = errorPayload?.message || 'Erro TikTok Ads';
    }
    return await emit({ ...ctx, category, action, severity, message,
      metadata: { code, raw: errorPayload }
    }, tokenInvalid);
  }

  return { tokenInvalid: false };
}

async function emit(
  ctx: ClassifyContext & { category: AuditCategory; action: string; severity: AuditSeverity; message: string; metadata: any },
  tokenInvalid: boolean,
): Promise<{ tokenInvalid: boolean }> {
  await logAudit(ctx.serviceClient, {
    company_id: ctx.company_id,
    actor_user_id: ctx.actor_user_id ?? null,
    actor_type: ctx.actor_type ?? 'user',
    category: ctx.category,
    action: ctx.action,
    platform: ctx.platform,
    severity: ctx.severity,
    message: ctx.message,
    metadata: { ...ctx.metadata, endpoint: ctx.endpoint, http_status: ctx.http_status },
  });

  if (tokenInvalid) {
    try {
      await ctx.serviceClient
        .from('platform_configurations')
        .update({ is_active: false })
        .eq('company_id', ctx.company_id)
        .eq('platform', ctx.platform);
      if (ctx.platform === 'meta') {
        await ctx.serviceClient
          .from('meta_configurations')
          .update({ is_active: false })
          .eq('company_id', ctx.company_id);
      }
    } catch (e) {
      console.error('[audit] failed to mark connection inactive', e);
    }
  }
  return { tokenInvalid };
}
