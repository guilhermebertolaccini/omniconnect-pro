// Platform service registry — abstracts Meta / Google Ads / TikTok Ads behind a unified API.

import { supabase } from '@/integrations/supabase/client';
import { fetchAdAccounts as fetchMetaAccounts } from '@/services/adAccountsService';
import { fetchCampaigns as fetchMetaCampaigns } from '@/services/campaignsService';
import type { AdAccount, Campaign } from '@/types/campaign';
import type { AdPlatform } from '@/services/platformConfigService';

export interface CreateCampaignInput {
  name: string;
  objective: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  status?: 'ACTIVE' | 'PAUSED';
  startTime?: string;
  stopTime?: string;
}

export interface PlatformAdapter {
  fetchAccounts(companyId: string): Promise<AdAccount[]>;
  fetchCampaigns(companyId: string, accountId: string, datePreset: string): Promise<Campaign[]>;
  createCampaign(companyId: string, accountId: string, input: CreateCampaignInput): Promise<{ id?: string; raw: unknown }>;
}

// ---- Meta adapter (delegates to existing services) ----

async function metaProxy(companyId: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('meta-api-proxy', {
    body: { company_id: companyId, ...body },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  return data;
}

const META_OBJECTIVE_MAP: Record<string, string> = {
  Conversions: 'OUTCOME_SALES',
  'Lead Generation': 'OUTCOME_LEADS',
  Awareness: 'OUTCOME_AWARENESS',
  Traffic: 'OUTCOME_TRAFFIC',
  Engagement: 'OUTCOME_ENGAGEMENT',
};

const metaAdapter: PlatformAdapter = {
  fetchAccounts: (companyId) => fetchMetaAccounts(companyId),
  fetchCampaigns: (companyId, accountId, datePreset) =>
    fetchMetaCampaigns(companyId, accountId, datePreset),

  async createCampaign(companyId, accountId, input) {
    const data = await metaProxy(companyId, {
      action: 'create_campaign',
      ad_account_id: accountId,
      name: input.name,
      objective: META_OBJECTIVE_MAP[input.objective] || input.objective,
      status: input.status || 'PAUSED',
      daily_budget: input.dailyBudget,
      lifetime_budget: input.lifetimeBudget,
      start_time: input.startTime,
      stop_time: input.stopTime,
      special_ad_categories: [],
    });
    if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    return { id: data?.id, raw: data };
  },
};

// ---- Google Ads adapter ----

async function googleProxy(companyId: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('google-ads-proxy', {
    body: { company_id: companyId, ...body },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  return data;
}

const GOOGLE_DATE_PRESET_MAP: Record<string, string> = {
  today: 'TODAY',
  yesterday: 'YESTERDAY',
  last_3d: 'LAST_7_DAYS',
  last_7d: 'LAST_7_DAYS',
  last_14d: 'LAST_14_DAYS',
  last_28d: 'LAST_30_DAYS',
  last_30d: 'LAST_30_DAYS',
  this_month: 'THIS_MONTH',
  last_month: 'LAST_MONTH',
};

const googleAdapter: PlatformAdapter = {
  async fetchAccounts(companyId) {
    const data = await googleProxy(companyId, { action: 'test_connection' });
    if (!data?.success) return [];
    return (data.accounts || []).map((a: any) => ({
      id: a.id,
      name: a.name || a.id,
      businessName: a.name || a.id,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      status: 'connected' as const,
      lastSync: new Date().toISOString(),
      totalSpent: 0,
      activeCampaigns: 0,
    }));
  },

  async fetchCampaigns(companyId, accountId, datePreset) {
    const customerId = accountId.replace(/-/g, '').replace(/^customers\//, '');
    const dateClause = GOOGLE_DATE_PRESET_MAP[datePreset] || 'LAST_7_DAYS';
    const gaql = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions
      FROM campaign
      WHERE segments.date DURING ${dateClause}
    `;
    const data = await googleProxy(companyId, {
      action: 'proxy',
      endpoint: `/customers/${customerId}/googleAds:search`,
      method: 'POST',
      body: { query: gaql },
    });

    return (data?.results || []).map((row: any) => {
      const c = row.campaign || {};
      const m = row.metrics || {};
      const spend = (parseInt(m.costMicros || '0', 10) || 0) / 1_000_000;
      const clicks = parseInt(m.clicks || '0', 10);
      const impressions = parseInt(m.impressions || '0', 10);
      const conversions = parseFloat(m.conversions || '0');
      return {
        id: String(c.id),
        name: c.name || `Campaign ${c.id}`,
        accountName: '',
        status: c.status === 'ENABLED' ? 'active' : c.status === 'PAUSED' ? 'paused' : 'ended',
        objective: c.advertisingChannelType || 'UNKNOWN',
        budget: 0,
        spent: spend,
        impressions,
        clicks,
        conversions,
        ctr: parseFloat(m.ctr || '0') * 100,
        cpc: (parseInt(m.averageCpc || '0', 10) || 0) / 1_000_000,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        roas: 0,
        cpa: conversions > 0 ? spend / conversions : 0,
        whatsappConversations: 0,
        mqls: 0,
        sqls: 0,
        salesClosed: 0,
        startDate: '',
      } satisfies Campaign;
    });
  },

  async createCampaign(companyId, accountId, input) {
    const data = await googleProxy(companyId, {
      action: 'create_campaign',
      customer_id: accountId,
      name: input.name,
      daily_budget: input.dailyBudget || input.lifetimeBudget,
      status: input.status || 'PAUSED',
      advertising_channel_type: 'SEARCH',
    });
    return { id: data?.campaign?.resourceName, raw: data };
  },
};

// ---- TikTok Ads adapter ----

async function tiktokProxy(companyId: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('tiktok-ads-proxy', {
    body: { company_id: companyId, ...body },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  return data;
}

const tiktokAdapter: PlatformAdapter = {
  async fetchAccounts(companyId) {
    // Prefer advertiser_ids saved during OAuth (no extra Business API roundtrip)
    const { data: cfg } = await supabase
      .from('platform_configurations')
      .select('extra, account_id')
      .eq('company_id', companyId)
      .eq('platform', 'tiktok_ads')
      .maybeSingle();

    const ids: string[] = (cfg?.extra as any)?.advertiser_ids || (cfg?.account_id ? [cfg.account_id] : []);
    if (ids.length > 0) {
      return ids.map((id) => ({
        id,
        name: id,
        businessName: id,
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        status: 'connected' as const,
        lastSync: new Date().toISOString(),
        totalSpent: 0,
        activeCampaigns: 0,
      }));
    }

    const data = await tiktokProxy(companyId, { action: 'test_connection' });
    if (!data?.success) return [];
    return (data.accounts || []).map((a: any) => ({
      id: a.id,
      name: a.name || a.id,
      businessName: a.name || a.id,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      status: 'connected' as const,
      lastSync: new Date().toISOString(),
      totalSpent: 0,
      activeCampaigns: 0,
    }));
  },

  async fetchCampaigns(companyId, accountId) {
    // 1. Campaign list
    const list = await tiktokProxy(companyId, {
      action: 'proxy',
      endpoint: '/campaign/get/',
      method: 'GET',
      params: { advertiser_id: accountId, page: 1, page_size: 100 },
    });

    const campaigns: Campaign[] = (list?.data?.list || []).map((c: any) => ({
      id: String(c.campaign_id),
      name: c.campaign_name || `Campaign ${c.campaign_id}`,
      accountName: '',
      status:
        c.operation_status === 'ENABLE' ? 'active' : c.operation_status === 'DISABLE' ? 'paused' : 'ended',
      objective: c.objective_type || 'UNKNOWN',
      budget: parseFloat(c.budget || '0'),
      spent: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      cpc: 0,
      cpm: 0,
      roas: 0,
      cpa: 0,
      whatsappConversations: 0,
      mqls: 0,
      sqls: 0,
      salesClosed: 0,
      startDate: c.create_time || '',
    } satisfies Campaign));

    if (campaigns.length === 0) return campaigns;

    // 2. Metrics via integrated report
    try {
      const report = await tiktokProxy(companyId, {
        action: 'proxy',
        endpoint: '/report/integrated/get/',
        method: 'GET',
        params: {
          advertiser_id: accountId,
          report_type: 'BASIC',
          data_level: 'AUCTION_CAMPAIGN',
          dimensions: JSON.stringify(['campaign_id']),
          metrics: JSON.stringify(['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'conversion']),
          start_date: new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10),
          page: 1,
          page_size: 200,
        },
      });
      const rows = report?.data?.list || [];
      const metricsById = new Map<string, any>();
      for (const r of rows) {
        const id = String(r.dimensions?.campaign_id);
        metricsById.set(id, r.metrics || {});
      }
      for (const c of campaigns) {
        const m = metricsById.get(c.id);
        if (!m) continue;
        c.spent = parseFloat(m.spend || '0');
        c.impressions = parseInt(m.impressions || '0', 10);
        c.clicks = parseInt(m.clicks || '0', 10);
        c.ctr = parseFloat(m.ctr || '0');
        c.cpc = parseFloat(m.cpc || '0');
        c.cpm = parseFloat(m.cpm || '0');
        c.conversions = parseFloat(m.conversion || '0');
        c.cpa = c.conversions > 0 ? c.spent / c.conversions : 0;
      }
    } catch (err) {
      console.warn('TikTok report fetch failed:', err);
    }

    return campaigns;
  },

  async createCampaign(companyId, accountId, input) {
    const data = await tiktokProxy(companyId, {
      action: 'create_campaign',
      advertiser_id: accountId,
      campaign_name: input.name,
      objective_type: input.objective || 'TRAFFIC',
      budget_mode: input.dailyBudget ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL',
      budget: input.dailyBudget || input.lifetimeBudget,
      operation_status: input.status === 'ACTIVE' ? 'ENABLE' : 'DISABLE',
    });
    return { id: data?.campaign_id, raw: data };
  },
};

// ---- Registry ----

const REGISTRY: Record<AdPlatform, PlatformAdapter> = {
  meta: metaAdapter,
  google_ads: googleAdapter,
  tiktok_ads: tiktokAdapter,
};

export function getPlatformAdapter(platform: AdPlatform): PlatformAdapter {
  return REGISTRY[platform];
}

/** Check if a company has an active config for the given platform. */
export async function hasActivePlatformConfig(
  platform: AdPlatform,
  companyId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('platform_configurations')
    .select('id')
    .eq('platform', platform)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}
