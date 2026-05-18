import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classifyAndLogPlatformError, logAudit } from '../_shared/audit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TIKTOK_BASE = 'https://business-api.tiktok.com/open_api/v1.3'
const OAUTH_AUTH_URL = 'https://business-api.tiktok.com/portal/auth'
const OAUTH_TOKEN_URL = `${TIKTOK_BASE}/oauth2/access_token/`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)

  if (url.pathname.endsWith('/oauth/callback')) {
    const code = url.searchParams.get('auth_code') || url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) return new Response('Missing code or state', { status: 400 })

    try {
      const appId = Deno.env.get('TIKTOK_APP_ID')!
      const secret = Deno.env.get('TIKTOK_APP_SECRET')!

      const res = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, secret, auth_code: code }),
      })
      const data = await res.json()
      if (data.code !== 0) throw new Error(JSON.stringify(data))

      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      const accessToken = data.data.access_token
      const advertiserIds: string[] = data.data.advertiser_ids || []
      const expiresAt = data.data.expires_in
        ? new Date(Date.now() + data.data.expires_in * 1000).toISOString()
        : null

      await serviceClient.from('platform_configurations').upsert(
        {
          company_id: state,
          platform: 'tiktok_ads',
          access_token: accessToken,
          token_expires_at: expiresAt,
          account_id: advertiserIds[0] || null,
          extra: { advertiser_ids: advertiserIds },
          is_active: true,
          created_by: state, // placeholder
        },
        { onConflict: 'company_id,platform' }
      )

      return new Response(
        `<html><body style="font-family:sans-serif;background:#0F172A;color:#fff;padding:40px;text-align:center">
          <h2>TikTok Ads conectado!</h2>
          <p>Você pode fechar esta janela.</p>
          <script>window.close();</script>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      )
    } catch (err: any) {
      return new Response(`OAuth error: ${err.message}`, { status: 500 })
    }
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) return json({ error: 'Unauthorized' }, 401)

    const userId = claimsData.claims.sub
    const body = await req.json()
    const { action, company_id } = body
    if (!company_id) return json({ error: 'company_id required' }, 400)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: isAdmin } = await serviceClient.rpc('has_role', {
      _user_id: userId,
      _role: 'admin',
    })
    if (!isAdmin) {
      const { data: access } = await serviceClient
        .from('client_company_access')
        .select('id')
        .eq('user_id', userId)
        .eq('company_id', company_id)
        .maybeSingle()
      if (!access) return json({ error: 'No access to this company' }, 403)
    }

    if (action === 'get_oauth_url') {
      const appId = Deno.env.get('TIKTOK_APP_ID')
      if (!appId) return json({ error: 'TIKTOK_APP_ID not configured' }, 500)
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/tiktok-ads-proxy/oauth/callback`
      const params = new URLSearchParams({
        app_id: appId,
        redirect_uri: redirectUri,
        state: company_id,
      })
      return json({ url: `${OAUTH_AUTH_URL}?${params.toString()}` })
    }

    if (action === 'save_config') {
      const { access_token, account_id, advertiser_ids } = body
      const payload: Record<string, unknown> = {
        company_id,
        platform: 'tiktok_ads',
        account_id: account_id || null,
        extra: advertiser_ids ? { advertiser_ids } : {},
        is_active: true,
        created_by: userId,
      }
      if (access_token) payload.access_token = access_token

      const { data, error } = await serviceClient
        .from('platform_configurations')
        .upsert(payload, { onConflict: 'company_id,platform' })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ success: true, config: { ...data, access_token: '***masked***' } })
    }

    if (action === 'get_config') {
      const { data, error } = await serviceClient
        .from('platform_configurations')
        .select('*')
        .eq('company_id', company_id)
        .eq('platform', 'tiktok_ads')
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      if (!data) return json({ config: null })
      return json({
        config: {
          ...data,
          access_token: data.access_token ? `${data.access_token.substring(0, 8)}...` : null,
        },
      })
    }

    if (action === 'test_connection') {
      const { data: config } = await serviceClient
        .from('platform_configurations')
        .select('access_token, extra, account_id')
        .eq('company_id', company_id)
        .eq('platform', 'tiktok_ads')
        .maybeSingle()
      if (!config?.access_token) return json({ success: false, error: 'No token configured' })

      const res = await fetch(`${TIKTOK_BASE}/oauth2/advertiser/get/?app_id=${Deno.env.get('TIKTOK_APP_ID')}&secret=${Deno.env.get('TIKTOK_APP_SECRET')}`, {
        headers: { 'Access-Token': config.access_token },
      })
      const data = await res.json()
      if (data.code !== 0) return json({ success: false, error: data.message || 'TikTok API error' })
      const list = data.data?.list || []
      return json({
        success: true,
        accounts_count: list.length,
        accounts: list.map((a: any) => ({ id: a.advertiser_id, name: a.advertiser_name })),
      })
    }

    if (action === 'proxy') {
      const { endpoint, method = 'GET', params, body: requestBody } = body
      if (!endpoint) return json({ error: 'endpoint required' }, 400)

      const { data: config } = await serviceClient
        .from('platform_configurations')
        .select('access_token')
        .eq('company_id', company_id)
        .eq('platform', 'tiktok_ads')
        .maybeSingle()
      if (!config?.access_token) return json({ error: 'No token configured' }, 400)

      const tiktokUrl = new URL(`${TIKTOK_BASE}${endpoint}`)
      if (params && method === 'GET') {
        Object.entries(params).forEach(([k, v]) => tiktokUrl.searchParams.set(k, String(v)))
      }

      const res = await fetch(tiktokUrl.toString(), {
        method,
        headers: {
          'Access-Token': config.access_token,
          'Content-Type': 'application/json',
        },
        body: requestBody ? JSON.stringify(requestBody) : undefined,
      })
      const data = await res.json()
      if (data?.code && data.code !== 0) {
        await classifyAndLogPlatformError({
          serviceClient, company_id, actor_user_id: userId, actor_type: 'user',
          platform: 'tiktok_ads', endpoint, http_status: res.status,
        }, data)
      }
      return json(data, res.ok ? 200 : res.status)
    }

    if (action === 'create_campaign') {
      const {
        advertiser_id,
        campaign_name,
        objective_type = 'TRAFFIC',
        budget_mode = 'BUDGET_MODE_DAY',
        budget,
        operation_status = 'DISABLE',
      } = body as Record<string, any>

      if (!advertiser_id || !campaign_name || !budget) {
        return json({ error: 'advertiser_id, campaign_name and budget are required' }, 400)
      }

      const { data: config } = await serviceClient
        .from('platform_configurations')
        .select('access_token')
        .eq('company_id', company_id)
        .eq('platform', 'tiktok_ads')
        .maybeSingle()
      if (!config?.access_token) return json({ error: 'No token configured' }, 400)

      const res = await fetch(`${TIKTOK_BASE}/campaign/create/`, {
        method: 'POST',
        headers: { 'Access-Token': config.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advertiser_id: String(advertiser_id),
          campaign_name,
          objective_type,
          budget_mode,
          budget: Number(budget),
          operation_status,
        }),
      })
      const data = await res.json()
      if (data.code !== 0) return json({ error: data.message || 'TikTok create failed', details: data }, 400)
      return json({ success: true, campaign_id: data.data?.campaign_id, raw: data })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err: any) {
    console.error('tiktok-ads-proxy error:', err)
    return json({ error: err.message || 'Internal error' }, 500)
  }
})
