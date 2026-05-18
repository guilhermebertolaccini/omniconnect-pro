// Lead attribution — derive lead "source" labels from a campaign.
// Today UTM data isn't persisted, so we infer source from platform + objective.
// Future: read utm_source / utm_campaign from WhatsApp funnel events.

import type { AdPlatform } from '@/services/platformConfigService';
import { PLATFORM_LABELS } from '@/services/platformConfigService';

export interface AttributedLead {
  source: string;        // human-readable label
  medium: string;        // platform key
  campaignName: string;
  leads: number;
}

export function inferSource(platform: AdPlatform, objective?: string): string {
  const base = PLATFORM_LABELS[platform] ?? platform;
  if (!objective) return base;
  const o = objective.toLowerCase();
  if (o.includes('lead')) return `${base} · Lead Gen`;
  if (o.includes('sale') || o.includes('conv')) return `${base} · Conversões`;
  if (o.includes('traffic')) return `${base} · Tráfego`;
  if (o.includes('engage')) return `${base} · Engajamento`;
  if (o.includes('aware')) return `${base} · Awareness`;
  return base;
}
