// Fetches ad-level (creative) data from each ad platform via the proxy edge functions.
// Returns a normalized shape used by the Media Analysis "Top Criativos" view.

import { supabase } from '@/integrations/supabase/client';
import type { AdPlatform } from '@/services/platformConfigService';

export interface AdCreative {
  platform: AdPlatform;
  adId: string;
  campaignId?: string;
  campaignName?: string;
  name: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  format: 'image' | 'video' | 'carousel' | 'unknown';
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number;             // %
  conversionRate: number;  // % (leads/clicks * 100)
  thruPlayRate: number;    // % (video_p100 / impressions * 100)
  cpc: number;
}

async function invokeProxy(fn: string, companyId: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { company_id: companyId, ...body },
  });
  if (error) throw new Error(error.message);
  if (data?.error) {
    throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  }
  return data;
}

// ---------- META ----------
async function fetchMetaAds(
  companyId: string,
  adAccountId: string,
  days: 7 | 14 | 30 = 7,
): Promise<AdCreative[]> {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const datePreset = days === 14 ? 'last_14d' : days === 30 ? 'last_30d' : 'last_7d';
  const data = await invokeProxy('meta-api-proxy', companyId, {
    action: 'proxy',
    endpoint: `/${accountId}/ads`,
    method: 'GET',
    params: {
      fields:
        `id,name,campaign{id,name},creative{thumbnail_url,image_url,video_id,object_type},insights.date_preset(${datePreset}){impressions,clicks,spend,ctr,actions,video_p100_watched_actions}`,
      limit: '200',
    },
  });

  const items = (data?.data || []) as any[];
  return items.map((a): AdCreative => {
    const ins = a.insights?.data?.[0] || {};
    const impressions = parseInt(ins.impressions || '0', 10);
    const clicks = parseInt(ins.clicks || '0', 10);
    const spend = parseFloat(ins.spend || '0');
    const leadAction = (ins.actions || []).find(
      (x: any) => x.action_type === 'lead' || x.action_type === 'onsite_conversion.lead_grouped',
    );
    const leads = leadAction ? parseFloat(leadAction.value) : 0;
    const thru = (ins.video_p100_watched_actions || []).reduce(
      (s: number, x: any) => s + parseFloat(x.value || '0'),
      0,
    );
    const creative = a.creative || {};
    const objectType = String(creative.object_type || '').toLowerCase();
    const format: AdCreative['format'] = creative.video_id
      ? 'video'
      : objectType.includes('carousel')
        ? 'carousel'
        : creative.image_url || creative.thumbnail_url
          ? 'image'
          : 'unknown';

    return {
      platform: 'meta',
      adId: String(a.id),
      campaignId: a.campaign?.id,
      campaignName: a.campaign?.name,
      name: a.name || `Ad ${a.id}`,
      thumbnailUrl: creative.thumbnail_url || creative.image_url,
      format,
      spend,
      impressions,
      clicks,
      leads,
      ctr: parseFloat(ins.ctr || '0'),
      conversionRate: clicks > 0 ? (leads / clicks) * 100 : 0,
      thruPlayRate: impressions > 0 ? (thru / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
  });
}

// ---------- GOOGLE ADS ----------
async function fetchGoogleAds(
  companyId: string,
  customerId: string,
  days: 7 | 14 | 30 = 7,
): Promise<AdCreative[]> {
  const cid = customerId.replace(/-/g, '').replace(/^customers\//, '');
  const during = days === 14 ? 'LAST_14_DAYS' : days === 30 ? 'LAST_30_DAYS' : 'LAST_7_DAYS';
  const gaql = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.conversions,
      metrics.video_views
    FROM ad_group_ad
    WHERE segments.date DURING ${during}
  `;
  const data = await invokeProxy('google-ads-proxy', companyId, {
    action: 'proxy',
    endpoint: `/customers/${cid}/googleAds:search`,
    method: 'POST',
    body: { query: gaql, pageSize: 200 },
  });

  return ((data?.results || []) as any[]).map((row): AdCreative => {
    const ad = row.adGroupAd?.ad || {};
    const m = row.metrics || {};
    const impressions = parseInt(m.impressions || '0', 10);
    const clicks = parseInt(m.clicks || '0', 10);
    const spend = (parseInt(m.costMicros || '0', 10) || 0) / 1_000_000;
    const conversions = parseFloat(m.conversions || '0');
    const videoViews = parseInt(m.videoViews || '0', 10);
    const t = String(ad.type || '').toLowerCase();
    const format: AdCreative['format'] = t.includes('video')
      ? 'video'
      : t.includes('image')
        ? 'image'
        : t.includes('responsive')
          ? 'image'
          : 'unknown';

    return {
      platform: 'google_ads',
      adId: String(ad.id),
      campaignId: row.campaign?.id ? String(row.campaign.id) : undefined,
      campaignName: row.campaign?.name,
      name: ad.name || `Ad ${ad.id}`,
      format,
      spend,
      impressions,
      clicks,
      leads: conversions,
      ctr: parseFloat(m.ctr || '0') * 100,
      conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
      thruPlayRate: impressions > 0 ? (videoViews / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
  });
}

// ---------- TIKTOK ADS ----------
async function fetchTikTokAds(
  companyId: string,
  advertiserId: string,
  days: 7 | 14 | 30 = 7,
): Promise<AdCreative[]> {
  // 1. Ad metadata
  const list = await invokeProxy('tiktok-ads-proxy', companyId, {
    action: 'proxy',
    endpoint: '/ad/get/',
    method: 'GET',
    params: { advertiser_id: advertiserId, page: 1, page_size: 200 },
  });
  const ads = (list?.data?.list || []) as any[];
  if (ads.length === 0) return [];

  // 2. Performance via integrated report at AD level
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const report = await invokeProxy('tiktok-ads-proxy', companyId, {
    action: 'proxy',
    endpoint: '/report/integrated/get/',
    method: 'GET',
    params: {
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_AD',
      dimensions: JSON.stringify(['ad_id']),
      metrics: JSON.stringify([
        'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'conversion', 'video_play_actions',
      ]),
      start_date: start,
      end_date: today,
      page: 1,
      page_size: 500,
    },
  }).catch(() => null);

  const metricsById = new Map<string, any>();
  for (const r of report?.data?.list || []) {
    metricsById.set(String(r.dimensions?.ad_id), r.metrics || {});
  }

  return ads.map((a): AdCreative => {
    const m = metricsById.get(String(a.ad_id)) || {};
    const impressions = parseInt(m.impressions || '0', 10);
    const clicks = parseInt(m.clicks || '0', 10);
    const spend = parseFloat(m.spend || '0');
    const leads = parseFloat(m.conversion || '0');
    const videoViews = parseFloat(m.video_play_actions || '0');
    const fmt = String(a.ad_format || '').toLowerCase();
    const format: AdCreative['format'] = fmt.includes('video')
      ? 'video'
      : fmt.includes('carousel')
        ? 'carousel'
        : fmt.includes('image') || fmt.includes('single')
          ? 'image'
          : 'unknown';

    return {
      platform: 'tiktok_ads',
      adId: String(a.ad_id),
      campaignId: a.campaign_id ? String(a.campaign_id) : undefined,
      campaignName: a.campaign_name,
      name: a.ad_name || `Ad ${a.ad_id}`,
      thumbnailUrl: a.image_ids?.[0] ? undefined : a.video_cover_url,
      format,
      spend,
      impressions,
      clicks,
      leads,
      ctr: parseFloat(m.ctr || '0'),
      conversionRate: clicks > 0 ? (leads / clicks) * 100 : 0,
      thruPlayRate: impressions > 0 ? (videoViews / impressions) * 100 : 0,
      cpc: parseFloat(m.cpc || '0'),
    };
  });
}

export async function fetchAds(
  platform: AdPlatform,
  companyId: string,
  accountId: string,
  days: 7 | 14 | 30 = 7,
): Promise<AdCreative[]> {
  if (platform === 'meta') return fetchMetaAds(companyId, accountId, days);
  if (platform === 'google_ads') return fetchGoogleAds(companyId, accountId, days);
  if (platform === 'tiktok_ads') return fetchTikTokAds(companyId, accountId, days);
  return [];
}
