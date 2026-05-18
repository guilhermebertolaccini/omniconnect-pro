import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classifyAndLogPlatformError, logAudit } from '../_shared/audit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_ADS_API_VERSION = 'v17'
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Google Ads OAuth credentials not configured')

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)
  return data as { access_token: string; expires_in: number }
}

async function getValidAccessToken(serviceClient: any, companyId: string) {
  const { data: config } = await serviceClient
    .from('platform_configurations')
    .select('access_token, refresh_token, token_expires_at, account_id, extra')
    .eq('company_id', companyId)
    .eq('platform', 'google_ads')
    .maybeSingle()

  if (!config) throw new Error('No Google Ads config for this company')

  const expiresAt = config.token_expires_at ? new Date(config.token_expires_at).getTime() : 0
  const now = Date.now()

  if (config.access_token && expiresAt > now + 60_000) {
    return { token: config.access_token, account_id: config.account_id, extra: config.extra ?? {} }
  }

  if (!config.refresh_token) throw new Error('No refresh token; user must reconnect via OAuth')

  const refreshed = await refreshAccessToken(config.refresh_token)
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

  await serviceClient
    .from('platform_configurations')
    .update({ access_token: refreshed.access_token, token_expires_at: newExpiry })
    .eq('company_id', companyId)
    .eq('platform', 'google_ads')

  return { token: refreshed.access_token, account_id: config.account_id, extra: config.extra ?? {} }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)

  // Public OAuth callback (no auth needed)
  if (url.pathname.endsWith('/oauth/callback')) {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') // company_id
    if (!code || !state) {
      return new Response('Missing code or state', { status: 400 })
    }

    try {
      const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID')!
      const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')!
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-ads-proxy/oauth/callback`

      const tokenRes = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok) throw new Error(JSON.stringify(tokenData))

      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

      await serviceClient.from('platform_configurations').upsert(
        {
          company_id: state,
          platform: 'google_ads',
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt,
          is_active: true,
          // created_by is required; set on first insert via separate path — fallback: use service role bypass
          created_by: state, // placeholder; updated by client after callback when needed
        },
        { onConflict: 'company_id,platform' }
      )

      return new Response(
        `<html><body style="font-family:sans-serif;background:#0F172A;color:#fff;padding:40px;text-align:center">
          <h2>Google Ads conectado!</h2>
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
      const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID')
      if (!clientId) return json({ error: 'GOOGLE_ADS_CLIENT_ID not configured' }, 500)
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-ads-proxy/oauth/callback`
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/adwords',
        access_type: 'offline',
        prompt: 'consent',
        state: company_id,
      })
      return json({ url: `${OAUTH_AUTH_URL}?${params.toString()}` })
    }

    if (action === 'save_config') {
      // Manual config: developer_token, login_customer_id, account_id (and optionally a manually-supplied token)
      const { developer_token, login_customer_id, account_id, access_token, refresh_token } = body
      const extra: Record<string, string> = {}
      if (developer_token) extra.developer_token = developer_token
      if (login_customer_id) extra.login_customer_id = login_customer_id

      const payload: Record<string, unknown> = {
        company_id,
        platform: 'google_ads',
        account_id: account_id || null,
        extra,
        is_active: true,
        created_by: userId,
      }
      if (access_token) payload.access_token = access_token
      if (refresh_token) payload.refresh_token = refresh_token

      const { data, error } = await serviceClient
        .from('platform_configurations')
        .upsert(payload, { onConflict: 'company_id,platform' })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({
        success: true,
        config: { ...data, access_token: '***masked***', refresh_token: data.refresh_token ? '***masked***' : null },
      })
    }

    if (action === 'get_config') {
      const { data, error } = await serviceClient
        .from('platform_configurations')
        .select('*')
        .eq('company_id', company_id)
        .eq('platform', 'google_ads')
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      if (!data) return json({ config: null })
      return json({
        config: {
          ...data,
          access_token: data.access_token ? `${data.access_token.substring(0, 8)}...` : null,
          refresh_token: data.refresh_token ? '***masked***' : null,
        },
      })
    }

    if (action === 'test_connection') {
      const { token: accessToken, account_id, extra } = await getValidAccessToken(serviceClient, company_id)
      const developerToken = extra.developer_token || Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
      if (!developerToken) return json({ success: false, error: 'developer_token missing' })

      // List accessible customers
      const res = await fetch(`${GOOGLE_ADS_BASE}/customers:listAccessibleCustomers`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
        },
      })
      const data = await res.json()
      if (!res.ok) return json({ success: false, error: JSON.stringify(data) })
      return json({
        success: true,
        accounts_count: data.resourceNames?.length || 0,
        accounts: (data.resourceNames || []).map((r: string) => ({ id: r.split('/')[1], name: r })),
      })
    }

    if (action === 'proxy') {
      const { endpoint, method = 'GET', body: requestBody } = body
      if (!endpoint) return json({ error: 'endpoint required' }, 400)

      const { token: accessToken, extra } = await getValidAccessToken(serviceClient, company_id)
      const developerToken = extra.developer_token || Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
      if (!developerToken) return json({ error: 'developer_token missing' }, 400)

      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      }
      if (extra.login_customer_id) headers['login-customer-id'] = extra.login_customer_id

      const res = await fetch(`${GOOGLE_ADS_BASE}${endpoint}`, {
        method,
        headers,
        body: requestBody ? JSON.stringify(requestBody) : undefined,
      })
      const data = await res.json()
      if (!res.ok) {
        await classifyAndLogPlatformError({
          serviceClient, company_id, actor_user_id: userId, actor_type: 'user',
          platform: 'google_ads', endpoint, http_status: res.status,
        }, data)
      }
      return json(data, res.ok ? 200 : res.status)
    }

    if (action === 'create_campaign') {
      const {
        customer_id,
        name,
        daily_budget,
        advertising_channel_type = 'SEARCH',
        status = 'PAUSED',
      } = body as Record<string, any>

      if (!customer_id || !name || !daily_budget) {
        return json({ error: 'customer_id, name and daily_budget are required' }, 400)
      }

      const { token: accessToken, extra } = await getValidAccessToken(serviceClient, company_id)
      const developerToken = extra.developer_token || Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
      if (!developerToken) return json({ error: 'developer_token missing' }, 400)

      const cleanCustomerId = String(customer_id).replace(/-/g, '').replace(/^customers\//, '')
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      }
      if (extra.login_customer_id) headers['login-customer-id'] = extra.login_customer_id

      // Step 1: create campaign budget
      const budgetMicros = Math.round(Number(daily_budget) * 1_000_000)
      const budgetRes = await fetch(`${GOOGLE_ADS_BASE}/customers/${cleanCustomerId}/campaignBudgets:mutate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operations: [{
            create: {
              name: `${name} Budget ${Date.now()}`,
              amountMicros: String(budgetMicros),
              deliveryMethod: 'STANDARD',
              explicitlyShared: false,
            },
          }],
        }),
      })
      const budgetData = await budgetRes.json()
      if (!budgetRes.ok) return json({ error: 'budget_failed', details: budgetData }, budgetRes.status)
      const budgetResource = budgetData.results?.[0]?.resourceName
      if (!budgetResource) return json({ error: 'no budget resource returned', details: budgetData }, 500)

      // Step 2: create campaign
      const campaignRes = await fetch(`${GOOGLE_ADS_BASE}/customers/${cleanCustomerId}/campaigns:mutate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operations: [{
            create: {
              name,
              status,
              advertisingChannelType: advertising_channel_type,
              campaignBudget: budgetResource,
            },
          }],
        }),
      })
      const campaignData = await campaignRes.json()
      if (!campaignRes.ok) return json({ error: 'campaign_failed', details: campaignData }, campaignRes.status)
      return json({ success: true, campaign: campaignData.results?.[0], budget: budgetResource })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err: any) {
    console.error('google-ads-proxy error:', err)
    return json({ error: err.message || 'Internal error' }, 500)
  }
})
