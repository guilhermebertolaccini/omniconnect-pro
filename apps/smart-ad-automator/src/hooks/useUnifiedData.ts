import { useQuery } from '@tanstack/react-query';
import { getPlatformAdapter, hasActivePlatformConfig } from '@/services/platformRegistry';
import type { AdPlatform } from '@/services/platformConfigService';
import type { Campaign } from '@/types/campaign';
import { mockCampaigns } from '@/data/mockData';

export interface PlatformResult {
  platform: AdPlatform;
  isLive: boolean;
  isLoading: boolean;
  error: Error | null;
  campaigns: Campaign[];
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
  };
}

const PLATFORMS: AdPlatform[] = ['meta', 'google_ads', 'tiktok_ads'];

function aggregate(campaigns: Campaign[]) {
  const t = campaigns.reduce(
    (acc, c) => {
      acc.spend += c.spent || 0;
      acc.impressions += c.impressions || 0;
      acc.clicks += c.clicks || 0;
      acc.conversions += c.conversions || 0;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
  );
  return {
    ...t,
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
  };
}

function usePlatform(platform: AdPlatform, companyId: string | null): PlatformResult {
  const { data: hasConfig } = useQuery({
    queryKey: ['platformConfigActive', platform, companyId],
    queryFn: () => hasActivePlatformConfig(platform, companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const isLive = !!companyId && !!hasConfig;

  // Fetch first account, then its campaigns
  const accountsQ = useQuery({
    queryKey: ['unifiedAccounts', platform, companyId],
    queryFn: () => getPlatformAdapter(platform).fetchAccounts(companyId!),
    enabled: isLive,
  });

  const firstAccount = accountsQ.data?.[0];

  const campaignsQ = useQuery({
    queryKey: ['unifiedCampaigns', platform, companyId, firstAccount?.id],
    queryFn: () =>
      getPlatformAdapter(platform).fetchCampaigns(companyId!, firstAccount!.id, 'last_7d'),
    enabled: isLive && !!firstAccount,
  });

  // Mock subset per platform when not live
  const mock = isLive ? [] : mockCampaigns.slice(0, 4).map((c) => ({ ...c }));
  const campaigns = isLive ? campaignsQ.data ?? [] : mock;

  return {
    platform,
    isLive,
    isLoading: isLive && (accountsQ.isLoading || campaignsQ.isLoading),
    error: (accountsQ.error as Error) || (campaignsQ.error as Error) || null,
    campaigns,
    totals: aggregate(campaigns),
  };
}

export function useUnifiedData(companyId: string | null) {
  const meta = usePlatform('meta', companyId);
  const google = usePlatform('google_ads', companyId);
  const tiktok = usePlatform('tiktok_ads', companyId);

  const platforms = [meta, google, tiktok];
  const all = platforms.flatMap((p) =>
    p.campaigns.map((c) => ({ ...c, _platform: p.platform })),
  );

  const aggregated = {
    spend: platforms.reduce((s, p) => s + p.totals.spend, 0),
    impressions: platforms.reduce((s, p) => s + p.totals.impressions, 0),
    clicks: platforms.reduce((s, p) => s + p.totals.clicks, 0),
    conversions: platforms.reduce((s, p) => s + p.totals.conversions, 0),
  };
  const aggregatedDerived = {
    ...aggregated,
    ctr: aggregated.impressions > 0 ? (aggregated.clicks / aggregated.impressions) * 100 : 0,
    cpc: aggregated.clicks > 0 ? aggregated.spend / aggregated.clicks : 0,
    cpa: aggregated.conversions > 0 ? aggregated.spend / aggregated.conversions : 0,
  };

  return {
    platforms,
    perPlatform: { meta, google_ads: google, tiktok_ads: tiktok } as Record<AdPlatform, PlatformResult>,
    aggregated: aggregatedDerived,
    allCampaigns: all,
    isLoading: platforms.some((p) => p.isLoading),
  };
}

export { PLATFORMS };
