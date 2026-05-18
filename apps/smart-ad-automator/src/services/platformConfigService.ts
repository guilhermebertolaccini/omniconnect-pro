/**
 * Sprint 2.4 — Bloco E. `platformConfigService` agora fala com o backend
 * `omniconnect-backend` em vez do Supabase. Mantém o shape antigo onde possível
 * para minimizar mudanças nos panels.
 *
 * Decisões:
 *   - "Company" do legado == AdvertiserCompany no backend.
 *   - Tokens NUNCA voltam do backend; só metadados mascarados.
 *   - Conexão de plataforma é criada pelo callback de OAuth, não por save
 *     manual de token. `savePlatformConfig` agora só altera campos não
 *     sensíveis (extra/accountId/isActive). Para conectar uma conta nova,
 *     usar `connectViaOAuth` (redirect server-side flow).
 */

import {
  OmniconnectError,
  request,
  startAdPlatformOAuth,
  type AdPlatform,
} from '@/lib/omniconnectClient';

export type { AdPlatform };

/** Shape mascarado devolvido pelo backend. */
export interface PlatformConnection {
  id: string;
  tenantId: string;
  advertiserCompanyId: string;
  platform: AdPlatform;
  accountId: string | null;
  isActive: boolean;
  tokenExpiresAt: string | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  accessTokenHint: string | null;
  extra: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
}

/** Alias para manter retrocompat com código antigo do SAA. */
export interface PlatformConfig {
  id: string;
  company_id: string;
  platform: AdPlatform;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_id: string | null;
  extra: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function toLegacyConfig(c: PlatformConnection): PlatformConfig {
  return {
    id: c.id,
    company_id: c.advertiserCompanyId,
    platform: c.platform,
    access_token: c.accessTokenHint ? `••••${c.accessTokenHint}` : null,
    refresh_token: c.hasRefreshToken ? '••••' : null,
    token_expires_at: c.tokenExpiresAt,
    account_id: c.accountId,
    extra: (c.extra as Record<string, unknown>) ?? {},
    is_active: c.isActive,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export const PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: 'Meta Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
};

// ───────────────────────────────────────────────────────────────────────────
// Listings
// ───────────────────────────────────────────────────────────────────────────

export interface AdvertiserCompany {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export function listAdvertiserCompanies(): Promise<AdvertiserCompany[]> {
  return request<AdvertiserCompany[]>('/advertiser-companies');
}

export async function listPlatformConnections(
  advertiserCompanyId?: string,
): Promise<PlatformConnection[]> {
  const qs = advertiserCompanyId
    ? `?${new URLSearchParams({ advertiserCompanyId }).toString()}`
    : '';
  return request<PlatformConnection[]>(`/ad-platform-connections${qs}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Single-connection ops
// ───────────────────────────────────────────────────────────────────────────

export async function getPlatformConnection(
  platform: AdPlatform,
  advertiserCompanyId: string,
): Promise<PlatformConnection | null> {
  const all = await listPlatformConnections(advertiserCompanyId);
  return all.find((c) => c.platform === platform) ?? null;
}

/** Retrocompat: agora retorna shape legado para o panel não precisar mudar. */
export async function getPlatformConfig(
  platform: AdPlatform,
  advertiserCompanyId: string,
): Promise<PlatformConfig | null> {
  const c = await getPlatformConnection(platform, advertiserCompanyId);
  return c ? toLegacyConfig(c) : null;
}

export interface PlatformConfigPatch {
  accountId?: string | null;
  isActive?: boolean;
  extra?: Record<string, unknown> | null;
}

/**
 * Atualiza metadata da conexão (não-secrets). Para girar tokens, usar OAuth.
 */
export async function updatePlatformConnection(
  connectionId: string,
  patch: PlatformConfigPatch,
): Promise<PlatformConnection> {
  return request<PlatformConnection>(`/ad-platform-connections/${connectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Retrocompat fina — pega a conexão e aplica o patch. */
export async function savePlatformConfig(
  platform: AdPlatform,
  advertiserCompanyId: string,
  patch: PlatformConfigPatch,
): Promise<PlatformConnection> {
  const existing = await getPlatformConnection(platform, advertiserCompanyId);
  if (!existing) {
    throw new OmniconnectError(
      `No active connection for ${platform}. Connect via OAuth first.`,
      404,
      null,
    );
  }
  return updatePlatformConnection(existing.id, patch);
}

export async function testPlatformConnection(
  connectionId: string,
): Promise<{ success: boolean; status?: number; accounts?: unknown[]; error?: string }> {
  try {
    const r = await request<{
      success: boolean;
      status?: number;
      accounts?: unknown[];
    }>(`/ad-platform-connections/${connectionId}/test`, { method: 'POST' });
    return r;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function removePlatformConnection(connectionId: string): Promise<void> {
  await request(`/ad-platform-connections/${connectionId}`, {
    method: 'DELETE',
    raw: true,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// OAuth pickup (server-side)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Gera a authorize URL e redireciona a janela atual para o provider. O backend
 * fecha o exchange no callback e bate de volta no frontend com
 * ?platform=&status=&connectionId=.
 *
 * @param returnUrl  Path RELATIVO (começa com '/') do SPA para o backend
 *                   redirecionar após o callback. URLs absolutas são
 *                   descartadas pelo backend (anti open-redirect).
 */
export async function connectViaOAuth(
  platform: AdPlatform,
  advertiserCompanyId: string,
  returnUrl?: string,
): Promise<void> {
  const { authorizeUrl } = await startAdPlatformOAuth(platform, {
    advertiserCompanyId,
    returnUrl,
  });
  window.location.href = authorizeUrl;
}
