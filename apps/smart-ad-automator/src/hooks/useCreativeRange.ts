// Refetch a single ad-level creative's metrics for a custom day range (7/14/30)
// and recompute its intent score using the active scoring weights.

import { useQuery } from '@tanstack/react-query';
import { fetchAds } from '@/services/adCreativesService';
import { getPlatformAdapter } from '@/services/platformRegistry';
import { intentScores } from '@/services/mediaScoring';
import { useIntentWeights } from '@/hooks/useScoringWeights';
import { useCompany } from '@/contexts/CompanyContext';
import type { RankedCreative } from '@/hooks/useAdCreatives';

export type CreativeRangeDays = 7 | 14 | 30;

export function useCreativeRange(
  creative: RankedCreative | null,
  days: CreativeRangeDays,
  enabled: boolean,
) {
  const { selectedCompanyId } = useCompany();
  const weights = useIntentWeights();

  return useQuery({
    queryKey: [
      'creativeRange',
      creative?.platform,
      creative?.adId,
      selectedCompanyId,
      days,
      weights,
    ],
    enabled: enabled && !!creative && !!selectedCompanyId,
    staleTime: 60_000,
    queryFn: async (): Promise<RankedCreative | null> => {
      if (!creative || !selectedCompanyId) return null;
      const accounts = await getPlatformAdapter(creative.platform).fetchAccounts(
        selectedCompanyId,
      );
      const account = accounts?.[0];
      if (!account) return null;
      const ads = await fetchAds(creative.platform, selectedCompanyId, account.id, days);
      const items = ads.filter((a) => a.impressions > 0);
      const scores = intentScores(items, weights);
      const idx = items.findIndex((a) => a.adId === creative.adId);
      if (idx === -1) return null;
      return { ...items[idx], intent: scores[idx] ?? 0 };
    },
  });
}
