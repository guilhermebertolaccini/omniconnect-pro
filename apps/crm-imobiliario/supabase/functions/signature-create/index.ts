import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

/**
 * Cria um envelope de assinatura no Clicksign para um contrato.
 * Body: { contractId: string, signers: Array<{ role, name, email, cpf? }> }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: cErr } = await supabase.auth.getClaims(token)
    if (cErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const contractId: string | undefined = body?.contractId
    const signers: Array<{ role: string; name: string; email: string; cpf?: string }> = body?.signers ?? []
    if (!contractId || signers.length === 0) {
      return json({ error: 'contractId e signers são obrigatórios' }, 400)
    }

    const CLICKSIGN_TOKEN = Deno.env.get('CLICKSIGN_API_TOKEN')
    if (!CLICKSIGN_TOKEN) {
      return json({
        error: 'CLICKSIGN_API_TOKEN não configurado. Configure em Cloud → Secrets para habilitar a assinatura digital real.',
      }, 503)
    }

    // Service role para escrever signatures e contracts ignorando RLS depois de validar acesso
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Verifica acesso ao contrato pela conexão do usuário
    const { data: contract, error: ctErr } = await supabase
      .from('contracts')
      .select('id, pdf_url, property_name, unit_number, client_name, broker_id')
      .eq('id', contractId)
      .maybeSingle()
    if (ctErr || !contract) return json({ error: 'Contrato não encontrado ou sem permissão' }, 404)
    if (!contract.pdf_url) return json({ error: 'O contrato precisa ter um PDF anexado antes de enviar para assinatura.' }, 400)

    const CLICKSIGN_BASE = Deno.env.get('CLICKSIGN_API_BASE') ?? 'https://app.clicksign.com'

    // 1) Baixa o PDF para enviar como base64
    const pdfRes = await fetch(contract.pdf_url)
    if (!pdfRes.ok) return json({ error: 'Falha ao baixar o PDF do contrato' }, 500)
    const pdfBuf = new Uint8Array(await pdfRes.arrayBuffer())
    const pdfBase64 = btoa(String.fromCharCode(...pdfBuf))

    // 2) Cria documento no Clicksign
    const docRes = await fetch(`${CLICKSIGN_BASE}/api/v1/documents?access_token=${CLICKSIGN_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        document: {
          path: `/Contratos/${contract.property_name}-${contract.unit_number}-${Date.now()}.pdf`,
          content_base64: `data:application/pdf;base64,${pdfBase64}`,
          deadline_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          auto_close: true,
          locale: 'pt-BR',
          sequence_enabled: false,
        },
      }),
    })
    const docJson = await docRes.json()
    if (!docRes.ok) return json({ error: 'Clicksign /documents falhou', details: docJson }, 502)
    const documentKey = docJson?.document?.key
    if (!documentKey) return json({ error: 'Clicksign não retornou document key', details: docJson }, 502)

    // 3) Cria signatários e adiciona-os ao documento
    const created: Array<{ role: string; signer_key: string; request_signature_key: string }> = []
    for (const s of signers) {
      const sigRes = await fetch(`${CLICKSIGN_BASE}/api/v1/signers?access_token=${CLICKSIGN_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          signer: {
            email: s.email,
            name: s.name,
            documentation: s.cpf ?? '',
            has_documentation: !!s.cpf,
            auths: ['email'],
          },
        }),
      })
      const sigJson = await sigRes.json()
      if (!sigRes.ok) return json({ error: 'Clicksign /signers falhou', details: sigJson }, 502)
      const signerKey = sigJson?.signer?.key

      const linkRes = await fetch(`${CLICKSIGN_BASE}/api/v1/lists?access_token=${CLICKSIGN_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          list: {
            document_key: documentKey,
            signer_key: signerKey,
            sign_as: s.role === 'witness1' || s.role === 'witness2' ? 'witness' : 'sign',
            message: `Olá ${s.name}, segue o contrato para sua assinatura digital.`,
          },
        }),
      })
      const linkJson = await linkRes.json()
      if (!linkRes.ok) return json({ error: 'Clicksign /lists falhou', details: linkJson }, 502)
      const requestKey = linkJson?.list?.request_signature_key

      created.push({ role: s.role, signer_key: signerKey, request_signature_key: requestKey })

      // Atualiza linha de signatures local com nome/email + token externo
      await admin
        .from('signatures')
        .upsert(
          {
            contract_id: contractId,
            role: s.role,
            signer_name: s.name,
            signer_email: s.email,
            status: 'pending',
          },
          { onConflict: 'contract_id,role' },
        )
    }

    // 4) Notifica os signatários por email (Clicksign envia)
    await fetch(`${CLICKSIGN_BASE}/api/v1/notifications?access_token=${CLICKSIGN_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ request_signature_keys: created.map((c) => c.request_signature_key) }),
    }).catch(() => {})

    // 5) Salva envelope no contrato e marca como pending_signature
    const envelopeUrl = `${CLICKSIGN_BASE}/documents/${documentKey}`
    await admin
      .from('contracts')
      .update({
        external_envelope_id: documentKey,
        external_envelope_url: envelopeUrl,
        external_provider: 'clicksign',
        status: 'pending_signature',
      })
      .eq('id', contractId)

    return json({ ok: true, documentKey, envelopeUrl, signers: created })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}