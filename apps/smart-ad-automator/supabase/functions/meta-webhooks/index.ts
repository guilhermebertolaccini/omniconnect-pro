// Meta webhooks endpoint (Facebook Login deauthorize, ads_account changes, etc.)
// GET = subscription verification
// POST = event delivery, signature validated with META_APP_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logAudit } from '../_shared/audit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
}

async function verifySignature(rawBody: string, signature: string, secret: string) {
  if (!signature?.startsWith('sha256=')) return false
  const provided = signature.slice('sha256='.length)
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0')).join('')
  return computed === provided
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')
  const appSecret = Deno.env.get('META_APP_SECRET')

  // Subscription verification
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('forbidden', { status: 403 })
  }

  if (!appSecret) {
    return new Response(JSON.stringify({ error: 'META_APP_SECRET not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256') ?? ''
  const ok = await verifySignature(rawBody, signature, appSecret)
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let payload: any
  try { payload = JSON.parse(rawBody) } catch { payload = {} }

  const entries = payload?.entry ?? []
  for (const entry of entries) {
    const changes = entry?.changes ?? []
    for (const change of changes) {
      const field = change?.field
      const value = change?.value
      // permissions.deauthorize → user revoked the app for a BM
      if (field === 'permissions' && value?.action === 'deauthorize') {
        const userId = value?.user_id
        await serviceClient.from('platform_configurations')
          .update({ is_active: false })
          .eq('platform', 'meta')
        await logAudit(serviceClient, {
          actor_type: 'webhook', category: 'oauth', action: 'connection.revoked',
          platform: 'meta', severity: 'critical',
          message: `Usuário Meta ${userId} revogou autorização do app`,
          metadata: { value, entry_id: entry?.id },
        })
        continue
      }

      await logAudit(serviceClient, {
        actor_type: 'webhook', category: 'webhook', action: `webhook.${field}`,
        platform: 'meta', severity: 'info',
        message: `Webhook Meta recebido: ${field}`,
        metadata: { entry_id: entry?.id, value },
      })
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
