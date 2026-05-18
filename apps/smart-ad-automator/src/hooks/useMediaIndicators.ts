// Aggregates campaign data across all active platforms into a normalized
// shape suitable for media indicators (spend, leads, CPL, intent, quality).

import { useMemo } from 'react';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import type { AdPlatform } from '@/services/platformConfigService';
import { inferSource } from '@/services/leadAttribution';
import { qualityScores } from '@/services/mediaScoring';

export interface NormalizedCampaign {
  platform: AdPlatform;
  campaignId: string;
  name: string;
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  ctr: number;
  cpc: number;
  qualifiedLeads: number;
  sales: number;
  source: string;
  qualityScore: number;
}

export interface ChannelTotals {
  platform: AdPlatform;
  spend: number;
  leads: number;
  cpl: number;
  share: number; // % of total spend
}

export interface MediaIndicators {
  isLoading: boolean;
  isLive: boolean;
  totals: { spend: number; leads: number; qualifiedLeads: number; cpl: number };
  byChannel: ChannelTotals[];
  bySource: { source: string; leads: number; share: number }[];
  campaigns: NormalizedCampaign[];
}

export function useMediaIndicators(companyId: string | null): MediaIndicators {
  const { platforms, isLoading } = useUnifiedData(companyId);

  return useMemo(() => {
    const isLive = platforms.some((p) => p.isLive);

    // 1. Normalize
    const raw = platforms.flatMap((p) =>
      p.campaigns.map((c) => {
        const leads = c.conversions || 0;
        return {
          platform: p.platform,
          campaignId: c.id,
          name: c.name,
          objective: c.objective,
          spend: c.spent || 0,
          impressions: c.impressions || 0,
          clicks: c.clicks || 0,
          leads,
          cpl: leads > 0 ? (c.spent || 0) / leads : 0,
          ctr: c.ctr || 0,
          cpc: c.cpc || 0,
          qualifiedLeads: c.mqls || 0,
          sales: c.salesClosed || 0,
          source: inferSource(p.platform, c.objective),
        };
      }),
    );

    // 2. Quality score
    const scores = qualityScores(raw);
    const campaigns: NormalizedCampaign[] = raw.map((c, i) => ({
      ...c,
      qualityScore: scores[i] ?? 0,
    }));

    // 3. Totals
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0);
    const totalQualified = campaigns.reduce((s, c) => s + c.qualifiedLeads, 0);

    // 4. By channel
    const channelMap = new Map<AdPlatform, { spend: number; leads: number }>();
    for (const c of campaigns) {
      const cur = channelMap.get(c.platform) ?? { spend: 0, leads: 0 };
      cur.spend += c.spend;
      cur.leads += c.leads;
      channelMap.set(c.platform, cur);
    }
    const byChannel: ChannelTotals[] = Array.from(channelMap.entries()).map(([platform, v]) => ({
      platform,
      spend: v.spend,
      leads: v.leads,
      cpl: v.leads > 0 ? v.spend / v.leads : 0,
      share: totalSpend > 0 ? (v.spend / totalSpend) * 100 : 0,
    }));

    // 5. By source
    const sourceMap = new Map<string, number>();
    for (const c of campaigns) {
      sourceMap.set(c.source, (sourceMap.get(c.source) ?? 0) + c.leads);
    }
    const bySource = Array.from(sourceMap.entries())
      .map(([source, leads]) => ({
        source,
        leads,
        share: totalLeads > 0 ? (leads / totalLeads) * 100 : 0,
      }))
      .sort((a, b) => b.leads - a.leads);

    return {
      isLoading,
      isLive,
      totals: {
        spend: totalSpend,
        leads: totalLeads,
        qualifiedLeads: totalQualified,
        cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      },
      byChannel: byChannel.sort((a, b) => b.spend - a.spend),
      bySource,
      campaigns,
    };
  }, [platforms, isLoading]);
}
