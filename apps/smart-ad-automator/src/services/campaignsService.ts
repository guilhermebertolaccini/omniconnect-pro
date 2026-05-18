// ==========================================
// Campaigns Service — Meta Marketing API
// ==========================================

import { fetchAllPages, metaFetch } from './metaApi';
import type {
  MetaCampaignRaw,
  MetaInsightRaw,
  MetaDailyInsightRaw,
  MetaAdSetRaw,
  MetaAdCreativeRaw,
  MetaApiResponse,
  MetaActionRaw,
} from '@/types/metaApiTypes';
import { mapEffectiveStatus, mapObjectiveLabel } from '@/types/metaApiTypes';
import type { Campaign } from '@/types/campaign';

// ---- Fields ----

const CAMPAIGN_FIELDS = [
  'id', 'name', 'objective', 'status', 'effective_status',
  'daily_budget', 'lifetime_budget', 'start_time', 'stop_time',
].join(',');

const INSIGHT_FIELDS = [
  'impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm',
  'actions', 'cost_per_action_type', 'date_start', 'date_stop',
].join(',');

// ---- Types for return values ----

export interface CampaignInsights {
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  cpa: number;
  roas: number;
}

export interface DailyInsight {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpc: number;
}

export interface Targeting {
  ageMin: number;
  ageMax: number;
  genders: 'all' | 'male' | 'female';
  interests: string[];
  countries: string[];
  cities: string[];
}

export interface Creative {
  format: 'image' | 'video' | 'carousel';
  headline: string;
  primaryText: string;
  description: string;
  ctaType: string;
  destinationUrl: string;
}

// ---- Main Functions ----

/**
 * Fetch all campaigns for an ad account, enriched with insights.
 */
export async function fetchCampaigns(
  companyId: string,
  accountId: string,
  datePresetOrRange = 'last_7d',
): Promise<Campaign[]> {
  const normalizedAccountId = accountId.replace(/^act_/, '').trim();
  if (!/^\d+$/.test(normalizedAccountId)) {
    throw new Error(`Invalid Meta ad account ID: ${accountId}`);
  }
  const actId = `act_${normalizedAccountId}`;

  const rawCampaigns = await fetchAllPages<MetaCampaignRaw>(
    companyId,
    `/${actId}/campaigns`,
    { fields: CAMPAIGN_FIELDS, limit: '100' },
  );

  const campaignsWithInsights = await Promise.all(
    rawCampaigns.map(async (raw) => {
      let insights: CampaignInsights | null = null;
      try {
        insights = await fetchCampaignInsights(companyId, raw.id, datePresetOrRange);
      } catch {
        // Campaign may have no insights (e.g. draft)
      }

      const budget = raw.daily_budget
        ? parseInt(raw.daily_budget, 10) / 100
        : raw.lifetime_budget
        ? parseInt(raw.lifetime_budget, 10) / 100
        : 0;

      return {
        id: raw.id,
        name: raw.name,
        accountName: '',
        status: mapEffectiveStatus(raw.effective_status || raw.status),
        objective: mapObjectiveLabel(raw.objective),
        budget,
        spent: insights?.spend ?? 0,
        impressions: insights?.impressions ?? 0,
        clicks: insights?.clicks ?? 0,
        conversions: insights?.conversions ?? 0,
        ctr: insights?.ctr ?? 0,
        cpc: insights?.cpc ?? 0,
        cpm: insights?.cpm ?? 0,
        roas: insights?.roas ?? 0,
        cpa: insights?.cpa ?? 0,
        whatsappConversations: 0,
        mqls: 0,
        sqls: 0,
        salesClosed: 0,
        startDate: raw.start_time ? raw.start_time.split('T')[0] : '',
        endDate: raw.stop_time ? raw.stop_time.split('T')[0] : undefined,
      } satisfies Campaign;
    }),
  );

  return campaignsWithInsights;
}

/**
 * Fetch aggregated insights for a single campaign.
 */
export async function fetchCampaignInsights(
  companyId: string,
  campaignId: string,
  datePresetOrRange = 'last_7d',
): Promise<CampaignInsights> {
  const params: Record<string, string> = { fields: INSIGHT_FIELDS };
  // If it starts with '{', it's a JSON time_range; otherwise it's a date_preset
  if (datePresetOrRange.startsWith('{')) {
    params.time_range = datePresetOrRange;
  } else {
    params.date_preset = datePresetOrRange;
  }

  const response = await metaFetch<MetaApiResponse<MetaInsightRaw>>(
    companyId,
    `/${campaignId}/insights`,
    params,
  );

  if (!response.data || response.data.length === 0) {
    return { impressions: 0, clicks: 0, spend: 0, ctr: 0, cpc: 0, cpm: 0, conversions: 0, cpa: 0, roas: 0 };
  }

  const insight = response.data[0];
  return parseInsight(insight);
}

/**
 * Fetch daily insights for chart rendering (time_increment=1).
 */
export async function fetchCampaignDailyInsights(
  companyId: string,
  campaignId: string,
  since?: string,
  until?: string,
): Promise<DailyInsight[]> {
  const params: Record<string, string> = {
    fields: INSIGHT_FIELDS,
    time_increment: '1',
  };
  if (since && until) {
    params.time_range = JSON.stringify({ since, until });
  } else {
    params.date_preset = 'last_7d';
  }

  const response = await metaFetch<MetaApiResponse<MetaDailyInsightRaw>>(
    companyId,
    `/${campaignId}/insights`,
    params,
  );

  return (response.data || []).map((d) => ({
    date: d.date_start,
    impressions: parseInt(d.impressions || '0', 10),
    clicks: parseInt(d.clicks || '0', 10),
    spend: parseFloat(d.spend || '0'),
    conversions: extractConversions(d.actions),
    ctr: parseFloat(d.ctr || '0'),
    cpc: parseFloat(d.cpc || '0'),
  }));
}

/**
 * Fetch targeting data for a campaign (via adsets).
 */
export async function fetchCampaignTargeting(
  companyId: string,
  campaignId: string,
): Promise<Targeting> {
  const response = await metaFetch<MetaApiResponse<MetaAdSetRaw>>(
    companyId,
    `/${campaignId}/adsets`,
    { fields: 'targeting,promoted_object', limit: '1' },
  );

  const adset = response.data?.[0];
  const t = adset?.targeting;

  const gendersRaw = t?.genders ?? [];
  let genders: 'all' | 'male' | 'female' = 'all';
  if (gendersRaw.length === 1) {
    genders = gendersRaw[0] === 1 ? 'male' : 'female';
  }

  const interests =
    t?.flexible_spec
      ?.flatMap((fs) => fs.interests?.map((i) => i.name) ?? []) ?? [];

  return {
    ageMin: t?.age_min ?? 18,
    ageMax: t?.age_max ?? 65,
    genders,
    interests,
    countries: t?.geo_locations?.countries ?? [],
    cities: t?.geo_locations?.cities?.map((c) => c.name) ?? [],
  };
}

/**
 * Fetch creative data for a campaign (via ads).
 */
export async function fetchCampaignCreative(
  companyId: string,
  campaignId: string,
): Promise<Creative> {
  const response = await metaFetch<MetaApiResponse<MetaAdCreativeRaw>>(
    companyId,
    `/${campaignId}/ads`,
    {
      fields: 'creative{title,body,image_url,video_url,call_to_action_type,object_story_spec}',
      limit: '1',
    },
  );

  const ad = response.data?.[0];
  const c = ad?.creative;
  const linkData = c?.object_story_spec?.link_data;
  const videoData = c?.object_story_spec?.video_data;

  let format: 'image' | 'video' | 'carousel' = 'image';
  if (c?.video_url || videoData) format = 'video';

  return {
    format,
    headline: c?.title || linkData?.name || videoData?.title || '',
    primaryText: c?.body || linkData?.message || videoData?.message || '',
    description: linkData?.description || '',
    ctaType: c?.call_to_action_type || linkData?.call_to_action?.type || videoData?.call_to_action?.type || '',
    destinationUrl: linkData?.call_to_action?.value?.link || linkData?.link || '',
  };
}

// ---- Helpers ----

function extractConversions(actions?: MetaActionRaw[]): number {
  if (!actions) return 0;
  const conversionTypes = [
    'offsite_conversion.fb_pixel_purchase',
    'offsite_conversion.fb_pixel_lead',
    'offsite_conversion.fb_pixel_complete_registration',
    'onsite_conversion.messaging_conversation_started_7d',
    'lead',
    'purchase',
    'complete_registration',
  ];
  return actions
    .filter((a) => conversionTypes.includes(a.action_type))
    .reduce((sum, a) => sum + parseInt(a.value, 10), 0);
}

function parseInsight(insight: MetaInsightRaw): CampaignInsights {
  const conversions = extractConversions(insight.actions);
  const spend = parseFloat(insight.spend || '0');
  const cpa = conversions > 0 ? spend / conversions : 0;

  const purchaseValue = insight.actions
    ?.filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')
    ?.reduce((sum, a) => sum + parseFloat(a.value), 0) ?? 0;
  const roas = spend > 0 && purchaseValue > 0 ? purchaseValue / spend : 0;

  return {
    impressions: parseInt(insight.impressions || '0', 10),
    clicks: parseInt(insight.clicks || '0', 10),
    spend,
    ctr: parseFloat(insight.ctr || '0'),
    cpc: parseFloat(insight.cpc || '0'),
    cpm: parseFloat(insight.cpm || '0'),
    conversions,
    cpa,
    roas,
  };
}
