import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

/**
 * Webhook público do Clicksign — recebe eventos sign / refuse / auto_close.
 * Validação HMAC opcional (CLICKSIGN_WEBHOOK_SECRET).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const raw = await req.text()

  // Validação de assinatura HMAC (opcional mas recomendada)
  const secret = Deno.env.get('CLICKSIGN_WEBHOOK_SECRET')
  if (secret) {
    const provided = req.headers.get('Content-Hmac') ?? req.headers.get('content-hmac') ?? ''
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
    const expected =
      'sha256=' +
      Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    if (provided !== expected) {
      return json({ error: 'Invalid HMAC' }, 401)
    }
  }

  const payload = JSON.parse(raw)
  const eventName: string = payload?.event?.name ?? payload?.event ?? ''
  const documentKey: string | undefined = payload?.document?.key
  const signerEmail: string | undefined =
    payload?.event?.data?.signer?.email ?? payload?.signer?.email
  const signedAt: string | undefined = payload?.event?.data?.signed_at ?? payload?.signed_at
  const ip: string | undefined = payload?.event?.data?.ip ?? payload?.ip
  const hash: string | undefined = payload?.document?.signed_file_hash ?? payload?.event?.data?.signature_hash

  if (!documentKey) return json({ error: 'documentKey ausente' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: contract } = await admin
    .from('contracts')
    .select('id')
    .eq('external_envelope_id', documentKey)
    .maybeSingle()

  if (!contract) return json({ ok: true, ignored: true })

  if ((eventName === 'sign' || eventName === 'signed') && signerEmail) {
    await admin
      .from('signatures')
      .update({
        status: 'signed',
        signed_at: signedAt ?? new Date().toISOString(),
        ip_address: ip ?? null,
        signature_hash: hash ?? null,
      })
      .eq('contract_id', contract.id)
      .eq('signer_email', signerEmail)
  } else if (eventName === 'refuse' && signerEmail) {
    await admin
      .from('signatures')
      .update({ status: 'refused' })
      .eq('contract_id', contract.id)
      .eq('signer_email', signerEmail)
  } else if (eventName === 'auto_close' || eventName === 'document_closed') {
    // O trigger sync_contract_signatures_jsonb cuida de marcar contracts.status = 'signed'
    // assim que todas as signatures estiverem signed.
  }

  return json({ ok: true })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}