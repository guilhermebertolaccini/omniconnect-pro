import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logAudit, classifyAndLogPlatformError } from '../_shared/audit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const META_BASE_URL = 'https://graph.facebook.com/v22.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { action, company_id, endpoint, params } = body

    if (!company_id) {
      return new Response(JSON.stringify({ error: 'company_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role to read the token (RLS would block access_token for non-admins)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify user has access to this company
    const userId = claimsData.claims.sub
    const { data: access } = await serviceClient
      .from('client_company_access')
      .select('id')
      .eq('user_id', userId)
      .eq('company_id', company_id)
      .maybeSingle()

    // Also check if user is admin
    const { data: isAdmin } = await serviceClient.rpc('has_role', {
      _user_id: userId,
      _role: 'admin',
    })

    if (!access && !isAdmin) {
      return new Response(JSON.stringify({ error: 'No access to this company' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle config actions (save/get config)
    if (action === 'save_config') {
      const { access_token, meta_business_id, ad_account_id, app_id, app_secret } = body

      if (!access_token) {
        return new Response(JSON.stringify({ error: 'access_token is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await serviceClient
        .from('meta_configurations')
        .upsert({
          company_id,
          access_token,
          meta_business_id: meta_business_id || null,
          ad_account_id: ad_account_id || null,
          app_id: app_id || null,
          app_secret: app_secret || null,
          created_by: userId,
          is_active: true,
        }, { onConflict: 'company_id' })
        .select()
        .single()

      if (error) {
        console.error('Error saving config:', error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true, config: { ...data, access_token: '***masked***' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'get_config') {
      const { data, error } = await serviceClient
        .from('meta_configurations')
        .select('*')
        .eq('company_id', company_id)
        .maybeSingle()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!data) {
        return new Response(JSON.stringify({ config: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Mask the token for non-admin or always
      const maskedConfig = {
        ...data,
        access_token: data.access_token ? `${data.access_token.substring(0, 8)}...${data.access_token.slice(-4)}` : null,
        app_secret: data.app_secret ? '***masked***' : null,
      }

      return new Response(JSON.stringify({ config: maskedConfig }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'test_connection') {
      const { data: config } = await serviceClient
        .from('meta_configurations')
        .select('access_token')
        .eq('company_id', company_id)
        .maybeSingle()

      if (!config?.access_token) {
        return new Response(JSON.stringify({ error: 'No token configured for this company' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Test the token by fetching ad accounts
      const metaUrl = `${META_BASE_URL}/me/adaccounts?fields=name,account_id,account_status&access_token=${config.access_token}`
      const metaRes = await fetch(metaUrl)
      const metaData = await metaRes.json()

      if (metaData.error) {
        await classifyAndLogPlatformError({
          serviceClient, company_id, actor_user_id: userId, actor_type: 'user',
          platform: 'meta', endpoint: '/me/adaccounts', http_status: metaRes.status,
        }, metaData)
        return new Response(JSON.stringify({ success: false, error: metaData.error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        success: true,
        accounts_count: metaData.data?.length || 0,
        accounts: metaData.data?.map((a: any) => ({ name: a.name, id: a.account_id })) || [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Proxy a Meta API call (GET/POST/DELETE)
    if (action === 'proxy') {
      if (!endpoint) {
        return new Response(JSON.stringify({ error: 'endpoint is required for proxy action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const method = (body.method || 'GET').toUpperCase()
      const requestBody = body.body as Record<string, unknown> | undefined

      const { data: config } = await serviceClient
        .from('meta_configurations')
        .select('access_token')
        .eq('company_id', company_id)
        .maybeSingle()

      if (!config?.access_token) {
        return new Response(JSON.stringify({ error: 'No token configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const metaUrl = new URL(`${META_BASE_URL}${endpoint}`)
      metaUrl.searchParams.set('access_token', config.access_token)
      if (params) {
        Object.entries(params).forEach(([k, v]) => metaUrl.searchParams.set(k, v as string))
      }

      const fetchInit: RequestInit = { method }
      if (method !== 'GET' && requestBody) {
        fetchInit.headers = { 'Content-Type': 'application/json' }
        fetchInit.body = JSON.stringify(requestBody)
      }

      const metaRes = await fetch(metaUrl.toString(), fetchInit)
      const metaData = await metaRes.json()

      if (!metaRes.ok || metaData?.error) {
        await classifyAndLogPlatformError({
          serviceClient, company_id, actor_user_id: userId, actor_type: 'user',
          platform: 'meta', endpoint, http_status: metaRes.status,
        }, metaData)
      }

      return new Response(JSON.stringify(metaData), {
        status: metaRes.ok ? 200 : metaRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create a Meta campaign (high-level shortcut)
    if (action === 'create_campaign') {
      const {
        ad_account_id,
        name,
        objective,
        status = 'PAUSED',
        daily_budget,
        lifetime_budget,
        special_ad_categories = [],
        start_time,
        stop_time,
      } = body as Record<string, any>

      if (!ad_account_id || !name || !objective) {
        return new Response(JSON.stringify({ error: 'ad_account_id, name and objective are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: config } = await serviceClient
        .from('meta_configurations')
        .select('access_token')
        .eq('company_id', company_id)
        .maybeSingle()
      if (!config?.access_token) {
        return new Response(JSON.stringify({ error: 'No token configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const accountPath = String(ad_account_id).startsWith('act_') ? ad_account_id : `act_${ad_account_id}`
      const payload: Record<string, unknown> = {
        name,
        objective,
        status,
        special_ad_categories,
      }
      if (daily_budget) payload.daily_budget = Math.round(Number(daily_budget) * 100) // BRL cents
      if (lifetime_budget) payload.lifetime_budget = Math.round(Number(lifetime_budget) * 100)
      if (start_time) payload.start_time = start_time
      if (stop_time) payload.stop_time = stop_time

      const metaUrl = new URL(`${META_BASE_URL}/${accountPath}/campaigns`)
      metaUrl.searchParams.set('access_token', config.access_token)

      const metaRes = await fetch(metaUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const metaData = await metaRes.json()
      return new Response(JSON.stringify(metaData), {
        status: metaRes.ok ? 200 : metaRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Proxy with server-side pagination
    if (action === 'proxy_all_pages') {
      if (!endpoint) {
        return new Response(JSON.stringify({ error: 'endpoint is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const maxPages = body.max_pages || 10

      const { data: config } = await serviceClient
        .from('meta_configurations')
        .select('access_token')
        .eq('company_id', company_id)
        .maybeSingle()

      if (!config?.access_token) {
        return new Response(JSON.stringify({ error: 'No token configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const allData: unknown[] = []
      let pageCount = 0

      // First page
      const firstUrl = new URL(`${META_BASE_URL}${endpoint}`)
      firstUrl.searchParams.set('access_token', config.access_token)
      if (params) {
        Object.entries(params).forEach(([k, v]) => firstUrl.searchParams.set(k, v as string))
      }

      let metaRes = await fetch(firstUrl.toString())
      let metaData = await metaRes.json()

      if (metaData.error) {
        await classifyAndLogPlatformError({
          serviceClient, company_id, actor_user_id: userId, actor_type: 'user',
          platform: 'meta', endpoint, http_status: metaRes.status,
        }, metaData)
        return new Response(JSON.stringify(metaData), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (metaData.data) allData.push(...metaData.data)
      let nextUrl = metaData.paging?.next

      // Follow pagination
      while (nextUrl && pageCount < maxPages) {
        pageCount++
        metaRes = await fetch(nextUrl)
        metaData = await metaRes.json()

        if (metaData.error) break
        if (metaData.data) allData.push(...metaData.data)
        nextUrl = metaData.paging?.next
      }

      return new Response(JSON.stringify(allData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
