import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Você é um especialista em mídia paga (Meta, Google Ads, TikTok Ads). Receberá métricas ad-level de UM criativo em DOIS períodos (primary e compare) — geralmente 7d vs 30d — incluindo CTR, taxa de conversão, ThruPlay, CPC, leads, spend, impressões, cliques e score de intenção.

Sua tarefa é responder em português do Brasil, de forma específica e acionável (cite números/deltas reais), em DUAS seções:
1. "whyChanged": 3 a 5 bullets curtos explicando POR QUE as principais métricas (CTR, conversão, ThruPlay/CPC, score de intenção) mudaram entre os dois períodos. Mencione magnitudes ("CTR caiu de X% para Y%, -Z pp") e ofereça causas plausíveis (fadiga, mudança de audiência, sazonalidade, alocação de budget, novo público, mudança de criativo, leilão mais caro).
2. "hypotheses": 3 a 5 bullets curtos com hipóteses concretas de teste a partir dessas variações, priorizadas pela alavanca de maior impacto. Sugira testes A/B claros (variar hook, formato, audiência, oferta, landing, lance, agendamento, etc.).

Critérios:
- Se o período mais curto (7d) está PIOR que o mais longo (30d), trate como sinal de fadiga ou queda recente.
- Se o período mais curto está MELHOR, trate como sinal positivo a escalar (subir budget, replicar para audiências similares).
- CTR ↓ e CPC ↑ juntos → sugerir refresh criativo.
- Conversão ↓ com CTR estável → testar landing/oferta.
- ThruPlay ↓ em vídeo → testar primeiros 3s e ritmo.

Responda SOMENTE JSON válido (sem markdown):
{
  "whyChanged": string[],
  "hypotheses": string[]
}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

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

    const body = await req.json()
    const { creative, primary, compare, primaryDays, compareDays } = body
    if (!creative || !primary || !compare) {
      return new Response(JSON.stringify({ error: 'creative, primary e compare são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userPayload = {
      creative,
      primaryPeriod: { days: primaryDays, metrics: primary },
      comparePeriod: { days: compareDays, metrics: compare },
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
          { role: 'user', content: `Compare os dois períodos e devolva o JSON:\n\n${JSON.stringify(userPayload, null, 2)}` },
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

    let parsed: { whyChanged?: string[]; hypotheses?: string[] }
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content
    } catch (e) {
      console.error('JSON parse error', e, content)
      return new Response(JSON.stringify({ error: 'JSON inválido retornado pela IA' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      whyChanged: Array.isArray(parsed.whyChanged) ? parsed.whyChanged : [],
      hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('creative-comparison-insights error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
