import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RankedCreative } from '@/hooks/useAdCreatives';

export interface CreativeInsights {
  whyPerforms: string[];
  whatToTest: string[];
}

async function fetchCreativeInsights(creative: RankedCreative): Promise<CreativeInsights> {
  const payload = {
    adId: creative.adId,
    name: creative.name,
    platform: creative.platform,
    format: creative.format,
    campaignName: creative.campaignName,
    intentScore: Math.round(creative.intent * 100),
    metrics: {
      ctr: Number(creative.ctr.toFixed(2)),
      conversionRate: Number(creative.conversionRate.toFixed(2)),
      thruPlayRate: Number(creative.thruPlayRate.toFixed(1)),
      cpc: Number(creative.cpc.toFixed(2)),
      spend: Number(creative.spend.toFixed(2)),
      leads: creative.leads,
      impressions: creative.impressions,
      clicks: creative.clicks,
    },
  };

  const { data, error } = await supabase.functions.invoke('creative-insights', {
    body: { creative: payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Erro na IA');
  return {
    whyPerforms: Array.isArray(data?.whyPerforms) ? data.whyPerforms : [],
    whatToTest: Array.isArray(data?.whatToTest) ? data.whatToTest : [],
  };
}

export function useCreativeInsights(creative: RankedCreative | null, enabled: boolean) {
  return useQuery({
    queryKey: ['creativeInsights', creative?.platform, creative?.adId],
    queryFn: () => fetchCreativeInsights(creative!),
    enabled: enabled && !!creative,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
