import type { Post } from './campaign';

export type ExperimentMode = 'retroactive' | 'manual' | 'publish';
export type ExperimentStatus = 'draft' | 'running' | 'completed' | 'cancelled';

export type WinningMetric =
  | 'engagement_rate'
  | 'reach'
  | 'impressions'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves'
  | 'total_interactions'
  | 'profile_visits'
  | 'website_clicks';

export interface VariantMetricsSnapshot {
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  engagement_rate?: number;
  total_interactions?: number;
  profile_visits?: number;
  website_clicks?: number;
  fetched_at?: string;
}

export interface ExperimentVariant {
  id: string;
  experiment_id: string;
  label: string;
  note: string | null;
  post_id: string | null;
  scheduled_for: string | null;
  caption: string | null;
  media_url: string | null;
  post_type: string | null;
  platform: string | null;
  metrics_snapshot: VariantMetricsSnapshot | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentAiSummary {
  whyWon: string[];
  nextHypotheses: string[];
  generatedAt: string;
}

export interface Experiment {
  id: string;
  agency_id: string;
  company_id: string;
  platform: string;
  account_id: string | null;
  name: string;
  hypothesis: string | null;
  mode: ExperimentMode;
  winning_metric: WinningMetric;
  min_sample_reach: number;
  duration_days: number;
  status: ExperimentStatus;
  started_at: string | null;
  ends_at: string | null;
  winner_variant_id: string | null;
  ai_summary: ExperimentAiSummary | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentWithVariants extends Experiment {
  variants: ExperimentVariant[];
}

export const WINNING_METRIC_LABELS: Record<WinningMetric, string> = {
  engagement_rate: 'Taxa de engajamento',
  reach: 'Alcance',
  impressions: 'Impressões',
  likes: 'Curtidas',
  comments: 'Comentários',
  shares: 'Compartilhamentos',
  saves: 'Salvamentos',
  total_interactions: 'Interações totais',
  profile_visits: 'Visitas ao perfil',
  website_clicks: 'Cliques no site',
};

export const EXPERIMENT_MODE_LABELS: Record<ExperimentMode, string> = {
  retroactive: 'Retroativo (analítico)',
  manual: 'Planejamento + tracking manual',
  publish: 'Criar e publicar',
};

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  draft: 'Rascunho',
  running: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

export function postToSnapshot(p: Post): VariantMetricsSnapshot {
  return {
    reach: p.reach,
    impressions: p.impressions,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    saves: p.saves,
    engagement_rate: p.engagementRate,
    total_interactions: p.likes + p.comments + p.shares + p.saves,
    profile_visits: p.profileVisits,
    website_clicks: p.websiteClicks,
    fetched_at: new Date().toISOString(),
  };
}
