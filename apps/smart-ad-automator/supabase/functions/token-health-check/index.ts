// Cron-friendly endpoint that scans platform_configurations for tokens
// that are about to expire (or already expired) and tries to refresh them.
// Logs every attempt to audit_logs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logAudit } from '../_shared/audit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const META_BASE = 'https://graph.facebook.com/v22.0'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TIKTOK_REFRESH_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/'

interface ConfigRow {
  id: string
  company_id: string
  platform: 'meta' | 'google_ads' | 'tiktok_ads'
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  is_active: boolean
  extra: Record<string, unknown>
}

async function refreshMeta(serviceClient: any, row: ConfigRow) {
  const appId = Deno.env.get('META_APP_ID')
  const appSecret = Deno.env.get('META_APP_SECRET')
  if (!appId || !appSecret) {
    await logAudit(serviceClient, {
      company_id: row.company_id, platform: 'meta', actor_type: 'cron',
      category: 'token', action: 'token.refresh_skipped', severity: 'warning',
      message: 'META_APP_ID/SECRET ausentes — refresh do Meta não é possível',
    })
    return
  }
  if (!row.access_token) return
  const url = `${META_BASE}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${row.access_token}`
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok || data.error) {
    await logAudit(serviceClient, {
      company_id: row.company_id, platform: 'meta', actor_type: 'cron',
      category: 'token', action: 'token.refresh_failed', severity: 'error',
      message: data?.error?.message || 'Falha ao renovar long-lived token Meta',
      metadata: { error: data?.error, http_status: res.status },
    })
    return
  }
  const newExpires = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString()
  await serviceClient.from('platform_configurations')
    .update({ access_token: data.access_token, token_expires_at: newExpires, is_active: true })
    .eq('id', row.id)
  await serviceClient.from('meta_configurations')
    .update({ access_token: data.access_token, token_expires_at: newExpires, is_active: true })
    .eq('company_id', row.company_id)
  await logAudit(serviceClient, {
    company_id: row.company_id, platform: 'meta', actor_type: 'cron',
    category: 'token', action: 'token.refreshed', severity: 'info',
    message: 'Long-lived token Meta renovado',
    metadata: { old_expires_at: row.token_expires_at, new_expires_at: newExpires },
  })
}

async function refreshGoogle(serviceClient: any, row: ConfigRow) {
  if (!row.refresh_token) return
  const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')
  if (!clientId || !clientSecret) return
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: row.refresh_token, grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    await logAudit(serviceClient, {
      company_id: row.company_id, platform: 'google_ads', actor_type: 'cron',
      category: 'token', action: 'token.refresh_failed', severity: 'error',
      message: 'Falha ao renovar token Google Ads',
      metadata: { error: data, http_status: res.status },
    })
    return
  }
  const newExpires = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
  await serviceClient.from('platform_configurations')
    .update({ access_token: data.access_token, token_expires_at: newExpires, is_active: true })
    .eq('id', row.id)
  await logAudit(serviceClient, {
    company_id: row.company_id, platform: 'google_ads', actor_type: 'cron',
    category: 'token', action: 'token.refreshed', severity: 'info',
    message: 'Token Google Ads renovado',
    metadata: { old_expires_at: row.token_expires_at, new_expires_at: newExpires },
  })
}

async function refreshTikTok(serviceClient: any, row: ConfigRow) {
  if (!row.refresh_token) return
  const appId = Deno.env.get('TIKTOK_APP_ID')
  const secret = Deno.env.get('TIKTOK_APP_SECRET')
  if (!appId || !secret) return
  const res = await fetch(TIKTOK_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, secret, refresh_token: row.refresh_token }),
  })
  const data = await res.json()
  if (data.code !== 0) {
    await logAudit(serviceClient, {
      company_id: row.company_id, platform: 'tiktok_ads', actor_type: 'cron',
      category: 'token', action: 'token.refresh_failed', severity: 'error',
      message: data?.message || 'Falha ao renovar token TikTok',
      metadata: { error: data, http_status: res.status },
    })
    return
  }
  const newExpires = data.data?.access_token_expire_in
    ? new Date(Date.now() + data.data.access_token_expire_in * 1000).toISOString()
    : null
  await serviceClient.from('platform_configurations')
    .update({
      access_token: data.data.access_token,
      refresh_token: data.data.refresh_token ?? row.refresh_token,
      token_expires_at: newExpires,
      is_active: true,
    })
    .eq('id', row.id)
  await logAudit(serviceClient, {
    company_id: row.company_id, platform: 'tiktok_ads', actor_type: 'cron',
    category: 'token', action: 'token.refreshed', severity: 'info',
    message: 'Token TikTok renovado',
    metadata: { old_expires_at: row.token_expires_at, new_expires_at: newExpires },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Tokens expiring within 7 days OR already expired
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const { data: rows, error } = await serviceClient
    .from('platform_configurations')
    .select('id, company_id, platform, access_token, refresh_token, token_expires_at, is_active, extra')
    .lte('token_expires_at', sevenDaysFromNow)
    .not('token_expires_at', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const summary = { processed: 0, refreshed: 0, expired: 0, skipped: 0 }
  const now = Date.now()

  for (const row of (rows ?? []) as ConfigRow[]) {
    summary.processed++
    const expMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
    const alreadyExpired = expMs < now

    if (alreadyExpired && !row.refresh_token && row.platform !== 'meta') {
      // Cannot refresh without a refresh_token (Google/TikTok)
      await logAudit(serviceClient, {
        company_id: row.company_id, platform: row.platform, actor_type: 'cron',
        category: 'token', action: 'token.expired', severity: 'critical',
        message: 'Token expirado e sem refresh_token disponível — reconexão necessária',
        metadata: { expired_at: row.token_expires_at },
      })
      await serviceClient.from('platform_configurations').update({ is_active: false }).eq('id', row.id)
      summary.expired++
      continue
    }

    try {
      if (row.platform === 'meta') await refreshMeta(serviceClient, row)
      else if (row.platform === 'google_ads') await refreshGoogle(serviceClient, row)
      else if (row.platform === 'tiktok_ads') await refreshTikTok(serviceClient, row)
      summary.refreshed++
    } catch (e: any) {
      summary.skipped++
      await logAudit(serviceClient, {
        company_id: row.company_id, platform: row.platform, actor_type: 'cron',
        category: 'token', action: 'token.refresh_failed', severity: 'error',
        message: e?.message || 'Erro inesperado no refresh',
      })
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
