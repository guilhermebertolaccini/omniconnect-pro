import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RankedCreative } from '@/hooks/useAdCreatives';

export interface CreativeComparisonInsights {
  whyChanged: string[];
  hypotheses: string[];
}

function metricsPayload(c: RankedCreative) {
  return {
    intentScore: Math.round(c.intent * 100),
    ctr: Number(c.ctr.toFixed(2)),
    conversionRate: Number(c.conversionRate.toFixed(2)),
    thruPlayRate: Number(c.thruPlayRate.toFixed(1)),
    cpc: Number(c.cpc.toFixed(2)),
    spend: Number(c.spend.toFixed(2)),
    leads: c.leads,
    impressions: c.impressions,
    clicks: c.clicks,
  };
}

async function fetchComparisonInsights(
  primary: RankedCreative,
  compare: RankedCreative,
  primaryDays: number,
  compareDays: number,
): Promise<CreativeComparisonInsights> {
  const { data, error } = await supabase.functions.invoke('creative-comparison-insights', {
    body: {
      creative: {
        adId: primary.adId,
        name: primary.name,
        platform: primary.platform,
        format: primary.format,
        campaignName: primary.campaignName,
      },
      primary: metricsPayload(primary),
      compare: metricsPayload(compare),
      primaryDays,
      compareDays,
    },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Erro na IA');
  return {
    whyChanged: Array.isArray(data?.whyChanged) ? data.whyChanged : [],
    hypotheses: Array.isArray(data?.hypotheses) ? data.hypotheses : [],
  };
}

export function useCreativeComparisonInsights(
  primary: RankedCreative | null,
  compare: RankedCreative | null,
  primaryDays: number,
  compareDays: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [
      'creativeComparisonInsights',
      primary?.platform,
      primary?.adId,
      primaryDays,
      compareDays,
    ],
    queryFn: () => fetchComparisonInsights(primary!, compare!, primaryDays, compareDays),
    enabled: enabled && !!primary && !!compare && primaryDays !== compareDays,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
