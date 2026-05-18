import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Você é um especialista em mídia paga e criativos para Meta, Google Ads e TikTok Ads. Receberá métricas ad-level de UM criativo (CTR, taxa de conversão, ThruPlay, CPC, leads, spend, formato, plataforma) e seu score de intenção.

Sua tarefa é responder em português do Brasil, de forma específica e acionável (não genérica), em DUAS seções:
1. "whyPerforms": 3 a 4 bullets curtos explicando por que ESSE criativo performa (ou não) considerando as métricas — referencie números reais.
2. "whatToTest": 3 a 4 bullets curtos com hipóteses concretas de teste (variação de hook, formato, audiência, CTA, oferta, landing, etc.) priorizadas pela alavanca métrica mais fraca.

Critérios:
- CTR baixo (<1%) → testar criativo/hook/thumb.
- Taxa de conversão baixa (<2%) → testar landing/oferta/qualificação.
- ThruPlay baixo em vídeo (<25%) → testar primeiros 3s, ritmo, ganchos.
- CPC alto → testar audiência, formato, leilão.
- Score de intenção alto + leads baixos → revisar oferta/funil.

Responda SOMENTE JSON válido (sem markdown):
{
  "whyPerforms": string[],
  "whatToTest": string[]
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

    const body = await req.json()
    const { creative } = body
    if (!creative || !creative.adId) {
      return new Response(JSON.stringify({ error: 'creative obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
          { role: 'user', content: `Analise este criativo e devolva o JSON:\n\n${JSON.stringify(creative, null, 2)}` },
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

    let parsed: { whyPerforms?: string[]; whatToTest?: string[] }
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content
    } catch (e) {
      console.error('JSON parse error', e, content)
      return new Response(JSON.stringify({ error: 'JSON inválido retornado pela IA' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      whyPerforms: Array.isArray(parsed.whyPerforms) ? parsed.whyPerforms : [],
      whatToTest: Array.isArray(parsed.whatToTest) ? parsed.whatToTest : [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('creative-insights error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
