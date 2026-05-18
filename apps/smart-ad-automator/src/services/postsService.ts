// ==========================================
// Posts Service — Instagram Graph API
// ==========================================

import { fetchAllPages, metaFetch } from './metaApi';
import type {
  MetaInstagramMediaRaw,
  MetaMediaInsightRaw,
  MetaMediaType,
} from '@/types/metaApiTypes';
import type { Post, PostType, PostPlatform } from '@/types/campaign';

const MEDIA_FIELDS = [
  'id', 'caption', 'media_type', 'media_url',
  'thumbnail_url', 'timestamp', 'permalink',
].join(',');

const INSIGHT_METRICS = [
  'reach', 'impressions', 'likes', 'comments',
  'shares', 'saved', 'total_interactions',
].join(',');

export interface PostMetrics {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  totalInteractions: number;
  engagementRate: number;
}

// ---- Main Functions ----

export async function fetchInstagramPosts(
  companyId: string,
  igUserId: string,
  accountName = 'Instagram',
): Promise<Post[]> {
  const rawMedia = await fetchAllPages<MetaInstagramMediaRaw>(
    companyId,
    `/${igUserId}/media`,
    { fields: MEDIA_FIELDS, limit: '50' },
  );

  const posts = await Promise.all(
    rawMedia.map(async (media) => {
      let metrics: PostMetrics | null = null;
      try {
        metrics = await fetchPostInsights(companyId, media.id);
      } catch {
        // Stories or very old posts may not have insights
      }

      return mapToPost(media, metrics, accountName);
    }),
  );

  return posts;
}

export async function fetchPostInsights(
  companyId: string,
  mediaId: string,
): Promise<PostMetrics> {
  const response = await metaFetch<{ data: MetaMediaInsightRaw[] }>(
    companyId,
    `/${mediaId}/insights`,
    { metric: INSIGHT_METRICS, period: 'lifetime' },
  );

  const metricsMap: Record<string, number> = {};
  (response.data || []).forEach((m) => {
    metricsMap[m.name] = m.values?.[0]?.value ?? 0;
  });

  const reach = metricsMap['reach'] ?? 0;
  const totalInteractions = metricsMap['total_interactions'] ?? 0;
  const engagementRate = reach > 0 ? (totalInteractions / reach) * 100 : 0;

  return {
    reach,
    impressions: metricsMap['impressions'] ?? 0,
    likes: metricsMap['likes'] ?? 0,
    comments: metricsMap['comments'] ?? 0,
    shares: metricsMap['shares'] ?? 0,
    saves: metricsMap['saved'] ?? 0,
    totalInteractions,
    engagementRate: Math.round(engagementRate * 100) / 100,
  };
}

// ---- Helpers ----

function mapMediaType(mediaType: MetaMediaType): PostType {
  switch (mediaType) {
    case 'VIDEO':
      return 'video';
    case 'CAROUSEL_ALBUM':
      return 'carousel';
    case 'IMAGE':
    default:
      return 'image';
  }
}

function mapToPost(
  media: MetaInstagramMediaRaw,
  metrics: PostMetrics | null,
  accountName: string,
): Post {
  return {
    id: media.id,
    accountName,
    platform: 'Instagram' as PostPlatform,
    type: mapMediaType(media.media_type),
    caption: media.caption || '',
    publishedAt: media.timestamp,
    thumbnailUrl: media.thumbnail_url || media.media_url,
    reach: metrics?.reach ?? 0,
    impressions: metrics?.impressions ?? 0,
    likes: metrics?.likes ?? 0,
    comments: metrics?.comments ?? 0,
    shares: metrics?.shares ?? 0,
    saves: metrics?.saves ?? 0,
    engagementRate: metrics?.engagementRate ?? 0,
    profileVisits: 0,
    websiteClicks: 0,
  };
}
