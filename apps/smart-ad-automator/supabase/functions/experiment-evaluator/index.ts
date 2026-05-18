import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

    const body = (await req.json()) as ReqBody;
    if (!body?.experimentId) {
      return new Response(JSON.stringify({ error: 'experimentId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: exp, error: eErr } = await supabase
      .from('organic_post_experiments')
      .select('*')
      .eq('id', body.experimentId)
      .single();
    if (eErr || !exp) throw eErr ?? new Error('experiment not found');

    const { data: variants, error: vErr } = await supabase
      .from('organic_post_experiment_variants')
      .select('*')
      .eq('experiment_id', body.experimentId);
    if (vErr) throw vErr;

    // Refresh metrics for each variant that has a post_id via the meta-api-proxy
    const refreshed = await Promise.all(
      (variants ?? []).map(async (v) => {
        if (!v.post_id) return v;
        try {
          const proxyRes = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-api-proxy`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: auth },
              body: JSON.stringify({
                action: 'proxy',
                company_id: exp.company_id,
                endpoint: `/${v.post_id}/insights`,
                params: {
                  metric: 'reach,impressions,likes,comments,shares,saved,total_interactions',
                  period: 'lifetime',
                },
              }),
            },
          );
          if (!proxyRes.ok) return v;
          const json = await proxyRes.json();
          const map: Record<string, number> = {};
          (json?.data ?? []).forEach((m: { name: string; values?: Array<{ value: number }> }) => {
            map[m.name] = m.values?.[0]?.value ?? 0;
          });
          const reach = map['reach'] ?? 0;
          const total = map['total_interactions'] ?? 0;
          const snap = {
            reach,
            impressions: map['impressions'] ?? 0,
            likes: map['likes'] ?? 0,
            comments: map['comments'] ?? 0,
            shares: map['shares'] ?? 0,
            saves: map['saved'] ?? 0,
            total_interactions: total,
            engagement_rate: reach > 0 ? Math.round((total / reach) * 10000) / 100 : 0,
            fetched_at: new Date().toISOString(),
          };
          await supabase
            .from('organic_post_experiment_variants')
            .update({ metrics_snapshot: snap })
            .eq('id', v.id);
          return { ...v, metrics_snapshot: snap };
        } catch (_e) {
          return v;
        }
      }),
    );

    // Pick winner
    const metric = exp.winning_metric as string;
    const minReach = exp.min_sample_reach ?? 0;
    const ranked = refreshed
      .map((v) => {
        const snap = (v.metrics_snapshot ?? {}) as Record<string, number>;
        return { id: v.id, value: snap[metric] ?? 0, reach: snap.reach ?? 0 };
      })
      .sort((a, b) => b.value - a.value);
    const top = ranked[0];
    const second = ranked[1];
    const allMeet = ranked.every((r) => r.reach >= minReach);
    const significant = !second || (top && top.value > 0 && (top.value - second.value) / top.value >= 0.1);
    const winnerId = allMeet && significant && top ? top.id : null;

    // Determine if experiment ended
    const endsAt = exp.ends_at ? new Date(exp.ends_at).getTime() : null;
    const ended = endsAt !== null && Date.now() >= endsAt;
    const newStatus = ended || winnerId ? 'completed' : exp.status;

    await supabase
      .from('organic_post_experiments')
      .update({ winner_variant_id: winnerId, status: newStatus })
      .eq('id', exp.id);

    return new Response(
      JSON.stringify({ winnerId, status: newStatus, ranking: ranked }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
