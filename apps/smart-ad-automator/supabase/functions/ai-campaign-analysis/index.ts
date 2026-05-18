import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Você é um especialista sênior em mídia paga, growth, funil de vendas, WhatsApp e performance comercial. Analise a campanha recebida considerando não apenas métricas de mídia, mas também a qualidade do funil comercial. Não dê recomendações genéricas. Explique se o problema parece estar em campanha, criativo, audiência, orçamento, WhatsApp, qualificação, vendas ou tracking. Responda sempre em português do Brasil. Retorne SOMENTE JSON válido no formato solicitado, sem markdown e sem comentários.

Critérios:
- CTR baixo => criativo ou audiência.
- CPC alto => competição, público ruim ou criativo fraco.
- CPA alto => conversão, oferta, público ou atendimento.
- Muitas conversas WhatsApp e poucos MQLs => qualificação ou promessa desalinhada.
- Muitos MQLs e poucos SQLs => maturidade do lead, abordagem comercial ou nurturing.
- Muitos SQLs e poucas vendas => fechamento, proposta, preço, follow-up ou time comercial.
- Imobiliário: foco em lead qualificado, visita, proposta e venda — não apenas ROAS.
- Não invente dados. Se faltar dado, mencione a limitação no diagnóstico.
- Recomendações práticas, priorizadas e acionáveis.

Formato JSON obrigatório:
{
  "campaignId": string,
  "overallScore": number (0-100),
  "diagnosis": string,
  "rootCause": string,
  "problems": string[],
  "recommendations": string[],
  "nextActions": [{ "title": string, "priority": "low"|"medium"|"high", "area": "campaign"|"creative"|"audience"|"whatsapp"|"sales"|"budget"|"tracking", "description": string }],
  "predictedImpact": string,
  "confidence": "low"|"medium"|"high"
}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = claimsData.claims.sub

    const body = await req.json()
    const { company_id, campaign, business_context, historical_metrics, platform } = body
    const platformSafe: 'meta' | 'google_ads' | 'tiktok_ads' =
      platform === 'google_ads' || platform === 'tiktok_ads' ? platform : 'meta'

    if (!company_id || !campaign?.id) {
      return new Response(JSON.stringify({ error: 'company_id e campaign.id são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Access check
    const { data: access } = await serviceClient
      .from('client_company_access').select('id')
      .eq('user_id', userId).eq('company_id', company_id).maybeSingle()
    const { data: isAdmin } = await serviceClient.rpc('has_role', {
      _user_id: userId, _role: 'admin',
    })
    if (!access && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Sem acesso a esta empresa' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userPayload = {
      platform: platformSafe,
      campaign,
      business_context: business_context || null,
      historical_metrics: historical_metrics || [],
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analise a campanha abaixo e retorne JSON conforme o formato.\n\n${JSON.stringify(userPayload, null, 2)}` },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('AI gateway error:', aiRes.status, errText)
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições da IA atingido. Tente novamente em instantes.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos da IA esgotados. Adicione créditos no workspace.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'Falha ao chamar IA', details: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const aiJson = await aiRes.json()
    const content = aiJson.choices?.[0]?.message?.content
    if (!content) {
      return new Response(JSON.stringify({ error: 'Resposta vazia da IA' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let analysis: Record<string, unknown>
    try {
      analysis = typeof content === 'string' ? JSON.parse(content) : content
    } catch (e) {
      console.error('JSON parse error', e, content)
      return new Response(JSON.stringify({ error: 'JSON inválido retornado pela IA' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    analysis.campaignId = analysis.campaignId || campaign.id
    analysis.generatedAt = new Date().toISOString()

    // Persist
    const { error: insertError } = await serviceClient
      .from('ai_campaign_analyses')
      .insert({
        company_id,
        platform: platformSafe,
        campaign_id: campaign.id,
        campaign_name: campaign.name || null,
        analysis,
        generated_by: userId,
      })
    if (insertError) console.error('Insert error:', insertError)

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('ai-campaign-analysis error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
