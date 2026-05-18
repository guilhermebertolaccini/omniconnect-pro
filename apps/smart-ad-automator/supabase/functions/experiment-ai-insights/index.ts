import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SYSTEM_PROMPT = `Você é um especialista em mídia orgânica do Meta. Recebe um teste A/B de posts orgânicos com 2-4 variantes, métricas finais e a métrica de vitória escolhida. Responda em JSON com:
- whyWon: array de 3-5 bullets explicando por que o vencedor venceu (ou empatou)
- nextHypotheses: array de 3-5 hipóteses priorizadas para o próximo teste
Bullets devem ser curtos, práticos, em pt-BR.`;

interface ReqBody {
  experimentId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    const body = (await req.json()) as ReqBody;
    const { data: exp } = await supabase
      .from('organic_post_experiments')
      .select('*')
      .eq('id', body.experimentId)
      .single();
    const { data: variants } = await supabase
      .from('organic_post_experiment_variants')
      .select('*')
      .eq('experiment_id', body.experimentId);
    if (!exp) throw new Error('experiment not found');

    const payload = {
      experiment: {
        name: exp.name,
        hypothesis: exp.hypothesis,
        winning_metric: exp.winning_metric,
        winner_variant_id: exp.winner_variant_id,
      },
      variants: (variants ?? []).map((v) => ({
        id: v.id,
        label: v.label,
        note: v.note,
        caption: v.caption,
        post_type: v.post_type,
        platform: v.platform,
        metrics: v.metrics_snapshot,
      })),
    };

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI gateway error: ${aiRes.status} ${t}`);
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);
    const summary = {
      whyWon: Array.isArray(parsed.whyWon) ? parsed.whyWon : [],
      nextHypotheses: Array.isArray(parsed.nextHypotheses) ? parsed.nextHypotheses : [],
      generatedAt: new Date().toISOString(),
    };

    await supabase
      .from('organic_post_experiments')
      .update({ ai_summary: summary })
      .eq('id', exp.id);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
