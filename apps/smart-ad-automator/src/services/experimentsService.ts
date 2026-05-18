import { supabase } from '@/integrations/supabase/client';
import type {
  Experiment,
  ExperimentMode,
  ExperimentVariant,
  ExperimentWithVariants,
  VariantMetricsSnapshot,
  WinningMetric,
} from '@/types/experiment';

export interface CreateExperimentInput {
  agency_id: string;
  company_id: string;
  platform: string;
  account_id?: string | null;
  name: string;
  hypothesis?: string;
  mode: ExperimentMode;
  winning_metric: WinningMetric;
  min_sample_reach: number;
  duration_days: number;
  variants: Array<{
    label: string;
    note?: string;
    post_id?: string;
    caption?: string;
    media_url?: string;
    post_type?: string;
    platform?: string;
    metrics_snapshot?: VariantMetricsSnapshot;
  }>;
}

export async function listExperiments(companyId: string): Promise<Experiment[]> {
  const { data, error } = await supabase
    .from('organic_post_experiments')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Experiment[];
}

export async function getExperiment(id: string): Promise<ExperimentWithVariants> {
  const { data: exp, error: e1 } = await supabase
    .from('organic_post_experiments')
    .select('*')
    .eq('id', id)
    .single();
  if (e1) throw e1;
  const { data: variants, error: e2 } = await supabase
    .from('organic_post_experiment_variants')
    .select('*')
    .eq('experiment_id', id)
    .order('created_at', { ascending: true });
  if (e2) throw e2;
  return { ...(exp as unknown as Experiment), variants: (variants ?? []) as unknown as ExperimentVariant[] };
}

export async function createExperiment(input: CreateExperimentInput): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const startNow = input.mode === 'retroactive';
  const startedAt = startNow ? new Date().toISOString() : null;
  const endsAt = startNow
    ? new Date(Date.now() + input.duration_days * 86400_000).toISOString()
    : null;

  const { data: exp, error } = await supabase
    .from('organic_post_experiments')
    .insert({
      agency_id: input.agency_id,
      company_id: input.company_id,
      platform: input.platform as 'meta' | 'google_ads' | 'tiktok_ads',
      account_id: input.account_id ?? null,
      name: input.name,
      hypothesis: input.hypothesis ?? null,
      mode: input.mode,
      winning_metric: input.winning_metric,
      min_sample_reach: input.min_sample_reach,
      duration_days: input.duration_days,
      status: startNow ? 'running' : 'draft',
      started_at: startedAt,
      ends_at: endsAt,
      created_by: userData.user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const variantsPayload = input.variants.map((v) => ({
    experiment_id: exp.id,
    label: v.label,
    note: v.note ?? null,
    post_id: v.post_id ?? null,
    caption: v.caption ?? null,
    media_url: v.media_url ?? null,
    post_type: v.post_type ?? null,
    platform: v.platform ?? null,
    metrics_snapshot: (v.metrics_snapshot ?? null) as never,
  }));
  const { error: ve } = await supabase
    .from('organic_post_experiment_variants')
    .insert(variantsPayload);
  if (ve) throw ve;

  return exp.id;
}

export async function deleteExperiment(id: string): Promise<void> {
  const { error } = await supabase.from('organic_post_experiments').delete().eq('id', id);
  if (error) throw error;
}

export async function updateExperimentStatus(
  id: string,
  status: 'running' | 'completed' | 'cancelled',
): Promise<void> {
  const patch = status === 'running'
    ? { status, started_at: new Date().toISOString() }
    : { status };
  const { error } = await supabase.from('organic_post_experiments').update(patch).eq('id', id);
  if (error) throw error;
}

export async function updateVariantPostId(variantId: string, postId: string | null): Promise<void> {
  const { error } = await supabase
    .from('organic_post_experiment_variants')
    .update({ post_id: postId })
    .eq('id', variantId);
  if (error) throw error;
}

export function pickWinner(
  variants: ExperimentVariant[],
  metric: WinningMetric,
  minReach: number,
): { winnerId: string | null; ranking: Array<{ id: string; value: number }> } {
  const ranking = variants
    .map((v) => {
      const reach = v.metrics_snapshot?.reach ?? 0;
      const value = (v.metrics_snapshot?.[metric] as number | undefined) ?? 0;
      return { id: v.id, value, reach };
    })
    .sort((a, b) => b.value - a.value);
  const top = ranking[0];
  const second = ranking[1];
  if (!top) return { winnerId: null, ranking };
  const allMeetReach = ranking.every((r) => r.reach >= minReach);
  const significant = !second || (top.value > 0 && (top.value - second.value) / top.value >= 0.1);
  return {
    winnerId: allMeetReach && significant ? top.id : null,
    ranking: ranking.map((r) => ({ id: r.id, value: r.value })),
  };
}
