// ==========================================
// Meta API raw response types
// ==========================================

import type { CampaignStatus } from './campaign';

/** Generic paginated response from Meta Graph API */
export interface MetaApiResponse<T> {
  data: T[];
  paging?: {
    cursors?: {
      before: string;
      after: string;
    };
    next?: string;
    previous?: string;
  };
}

/** Meta API error shape */
export interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// ---- Ad Accounts ----

export interface MetaAdAccountRaw {
  id: string; // "act_123456"
  name: string;
  account_status: number; // 1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED, etc.
  currency: string;
  timezone_name: string;
  amount_spent: string; // in cents as string
  balance: string;
  business_name?: string;
}

// ---- Campaigns ----

export interface MetaCampaignRaw {
  id: string;
  name: string;
  objective: string;
  status: string; // ACTIVE, PAUSED, DELETED, ARCHIVED
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

export interface MetaInsightRaw {
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
  conversions?: string;
  actions?: MetaActionRaw[];
  cost_per_action_type?: MetaActionRaw[];
  date_start: string;
  date_stop: string;
}

export interface MetaActionRaw {
  action_type: string;
  value: string;
}

export interface MetaDailyInsightRaw extends MetaInsightRaw {
  // same shape, one entry per day when time_increment=1
}

// ---- Ad Sets / Targeting ----

export interface MetaAdSetRaw {
  id: string;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[]; // 0=all, 1=male, 2=female
    flexible_spec?: Array<{
      interests?: Array<{ id: string; name: string }>;
    }>;
    geo_locations?: {
      countries?: string[];
      cities?: Array<{ key: string; name: string }>;
    };
  };
  promoted_object?: {
    pixel_id?: string;
    custom_event_type?: string;
    page_id?: string;
  };
}

// ---- Creatives ----

export interface MetaAdCreativeRaw {
  id: string;
  creative?: {
    title?: string;
    body?: string;
    image_url?: string;
    video_url?: string;
    call_to_action_type?: string;
    object_story_spec?: {
      link_data?: {
        link?: string;
        message?: string;
        name?: string;
        description?: string;
        call_to_action?: { type: string; value?: { link?: string } };
        image_hash?: string;
      };
      video_data?: {
        video_id?: string;
        message?: string;
        title?: string;
        call_to_action?: { type: string; value?: { link?: string } };
      };
    };
  };
}

// ---- Instagram Media ----

export type MetaMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';

export interface MetaInstagramMediaRaw {
  id: string;
  caption?: string;
  media_type: MetaMediaType;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  permalink?: string;
}

export interface MetaMediaInsightRaw {
  name: string; // "reach", "likes", etc.
  period: string;
  values: Array<{ value: number }>;
  title: string;
  id: string;
}

// ==========================================
// Mapping helpers
// ==========================================

/** Map Meta effective_status to local CampaignStatus */
export function mapEffectiveStatus(status: string): CampaignStatus {
  const normalized = status.toUpperCase();
  switch (normalized) {
    case 'ACTIVE':
      return 'active';
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ADSET_PAUSED':
      return 'paused';
    case 'DELETED':
    case 'ARCHIVED':
    case 'COMPLETED':
      return 'ended';
    case 'DISAPPROVED':
    case 'PENDING_REVIEW':
    case 'PREAPPROVED':
    case 'WITH_ISSUES':
      return 'issue';
    default:
      return 'paused';
  }
}

/** Map Meta campaign objective codes to Portuguese labels */
export function mapObjectiveLabel(objective: string): string {
  const map: Record<string, string> = {
    OUTCOME_TRAFFIC: 'Tráfego',
    OUTCOME_LEADS: 'Geração de Leads',
    OUTCOME_ENGAGEMENT: 'Engajamento',
    OUTCOME_AWARENESS: 'Reconhecimento',
    OUTCOME_SALES: 'Vendas',
    OUTCOME_APP_PROMOTION: 'Promoção de App',
    LINK_CLICKS: 'Cliques no Link',
    LEAD_GENERATION: 'Geração de Leads',
    CONVERSIONS: 'Conversões',
    BRAND_AWARENESS: 'Reconhecimento de Marca',
    REACH: 'Alcance',
    TRAFFIC: 'Tráfego',
    MESSAGES: 'Mensagens',
    VIDEO_VIEWS: 'Visualizações de Vídeo',
    POST_ENGAGEMENT: 'Engajamento',
    PAGE_LIKES: 'Curtidas na Página',
  };
  return map[objective] || objective;
}

/** Map Meta account_status code to a connection status label */
export function mapAccountStatus(code: number): 'connected' | 'syncing' | 'error' {
  // 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, etc.
  if (code === 1) return 'connected';
  if (code === 3 || code === 7 || code === 9) return 'syncing';
  return 'error';
}
