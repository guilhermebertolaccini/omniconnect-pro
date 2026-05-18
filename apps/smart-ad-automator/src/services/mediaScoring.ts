// Media scoring helpers — intent score (creatives) and commercial-quality score (campaigns).

export interface IntentInput {
  ctr: number;          // %
  conversionRate: number; // % (conversions / clicks * 100)
  thruPlayRate?: number; // % (videos)
}

export interface QualityInput {
  leads: number;
  qualifiedLeads: number;
  sales: number;
  cpl: number;
  aiQualityScore?: number; // 0..1
}

function normMinMax(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (span === 0) return values.map(() => 1);
  return values.map((v) => (v - min) / span);
}

export interface IntentWeightsInput {
  ctr: number;
  conversionRate: number;
  thruPlayRate: number;
}

const DEFAULT_INTENT_WEIGHTS: IntentWeightsInput = {
  ctr: 0.5,
  conversionRate: 0.3,
  thruPlayRate: 0.2,
};

/**
 * Score 0..1 weighting CTR, conversion rate and thruplay.
 * Pass the full set so normalization is in-context.
 * Optional weights are normalized to sum=1 so partial inputs still work.
 */
export function intentScores<T extends IntentInput>(
  items: T[],
  weights: IntentWeightsInput = DEFAULT_INTENT_WEIGHTS,
): number[] {
  const sum = weights.ctr + weights.conversionRate + weights.thruPlayRate;
  const w = sum > 0
    ? {
        ctr: weights.ctr / sum,
        conversionRate: weights.conversionRate / sum,
        thruPlayRate: weights.thruPlayRate / sum,
      }
    : DEFAULT_INTENT_WEIGHTS;
  const ctrs = normMinMax(items.map((i) => i.ctr || 0));
  const convs = normMinMax(items.map((i) => i.conversionRate || 0));
  const thrus = normMinMax(items.map((i) => i.thruPlayRate || 0));
  return items.map((_, i) => w.ctr * ctrs[i] + w.conversionRate * convs[i] + w.thruPlayRate * thrus[i]);
}

/**
 * Score 0..1 combining funnel quality, sales conversion, CPL eficiency and AI signal.
 */
export function qualityScores<T extends QualityInput>(items: T[]): number[] {
  // invert CPL so lower is better; then normalize
  const cpls = items.map((i) => (i.cpl > 0 ? i.cpl : Number.POSITIVE_INFINITY));
  const finiteCpls = cpls.map((v) => (Number.isFinite(v) ? v : 0));
  const cplNorm = normMinMax(finiteCpls).map((v) => 1 - v);

  return items.map((it, i) => {
    const qualityRate = it.leads > 0 ? it.qualifiedLeads / it.leads : 0;
    const salesRate = it.qualifiedLeads > 0 ? it.sales / it.qualifiedLeads : 0;
    const ai = it.aiQualityScore ?? 0.5;
    return 0.35 * qualityRate + 0.3 * salesRate + 0.2 * cplNorm[i] + 0.15 * ai;
  });
}

export function qualityBadge(score: number): { label: string; tone: 'good' | 'mid' | 'low' } {
  if (score >= 0.66) return { label: 'Alta', tone: 'good' };
  if (score >= 0.33) return { label: 'Média', tone: 'mid' };
  return { label: 'Baixa', tone: 'low' };
}
