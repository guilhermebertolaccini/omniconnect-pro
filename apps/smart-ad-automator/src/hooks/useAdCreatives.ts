// Hook that fetches ad-level creatives across all active platforms and ranks
// them by intent score (CTR, conversion rate, thru-play rate).

import { useQuery } from '@tanstack/react-query';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { fetchAds, type AdCreative } from '@/services/adCreativesService';
import { intentScores } from '@/services/mediaScoring';
import { useIntentWeights } from '@/hooks/useScoringWeights';
import { getPlatformAdapter } from '@/services/platformRegistry';
import type { AdPlatform } from '@/services/platformConfigService';

export interface RankedCreative extends AdCreative {
  intent: number; // 0..1
}

interface PlatformAdsState {
  platform: AdPlatform;
  isLoading: boolean;
  error: Error | null;
  creatives: AdCreative[];
}

function usePlatformAds(
  platform: AdPlatform,
  companyId: string | null,
  isLive: boolean,
): PlatformAdsState {
  const accountsQ = useQuery({
    queryKey: ['adsAccount', platform, companyId],
    queryFn: () => getPlatformAdapter(platform).fetchAccounts(companyId!),
    enabled: isLive && !!companyId,
    staleTime: 60_000,
  });

  const firstAccount = accountsQ.data?.[0];

  const adsQ = useQuery({
    queryKey: ['adCreatives', platform, companyId, firstAccount?.id],
    queryFn: () => fetchAds(platform, companyId!, firstAccount!.id),
    enabled: isLive && !!firstAccount,
    staleTime: 60_000,
  });

  return {
    platform,
    isLoading: isLive && (accountsQ.isLoading || adsQ.isLoading),
    error: (accountsQ.error as Error) || (adsQ.error as Error) || null,
    creatives: adsQ.data ?? [],
  };
}

export interface AdCreativesResult {
  isLoading: boolean;
  isLive: boolean;
  creatives: RankedCreative[];
  errors: { platform: AdPlatform; message: string }[];
}

export function useAdCreatives(companyId: string | null): AdCreativesResult {
  const { perPlatform } = useUnifiedData(companyId);
  const weights = useIntentWeights();

  const meta = usePlatformAds('meta', companyId, perPlatform.meta.isLive);
  const google = usePlatformAds('google_ads', companyId, perPlatform.google_ads.isLive);
  const tiktok = usePlatformAds('tiktok_ads', companyId, perPlatform.tiktok_ads.isLive);

  const all = [meta, google, tiktok];
  const isLive = all.some((p) => perPlatform[p.platform].isLive);
  const isLoading = all.some((p) => p.isLoading);

  const liveCreatives = all.flatMap((p) => p.creatives);

  const items = liveCreatives.filter((c) => c.impressions > 0);
  const scores = intentScores(items, weights);
  const creatives: RankedCreative[] = items
    .map((c, i) => ({ ...c, intent: scores[i] ?? 0 }))
    .sort((a, b) => b.intent - a.intent);

  return {
    isLoading,
    isLive,
    creatives,
    errors: all
      .filter((p) => p.error)
      .map((p) => ({ platform: p.platform, message: p.error!.message })),
  };
}
