import { supabase } from '@/integrations/supabase/client';

export type AdPlatform = 'meta' | 'google_ads' | 'tiktok_ads';

export interface PlatformConfig {
  id: string;
  company_id: string;
  platform: AdPlatform;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_id: string | null;
  extra: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const FUNCTION_BY_PLATFORM: Record<AdPlatform, string> = {
  meta: 'meta-api-proxy',
  google_ads: 'google-ads-proxy',
  tiktok_ads: 'tiktok-ads-proxy',
};

async function invoke(platform: AdPlatform, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_BY_PLATFORM[platform], { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getPlatformConfig(platform: AdPlatform, companyId: string): Promise<PlatformConfig | null> {
  const data = await invoke(platform, { action: 'get_config', company_id: companyId });
  return data.config || null;
}

export async function savePlatformConfig(
  platform: AdPlatform,
  companyId: string,
  fields: Record<string, unknown>,
) {
  return invoke(platform, { action: 'save_config', company_id: companyId, ...fields });
}

export async function testPlatformConnection(platform: AdPlatform, companyId: string) {
  return invoke(platform, { action: 'test_connection', company_id: companyId });
}

export async function getOAuthUrl(platform: AdPlatform, companyId: string): Promise<string> {
  const data = await invoke(platform, { action: 'get_oauth_url', company_id: companyId });
  return data.url;
}

export const PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: 'Meta Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
};
