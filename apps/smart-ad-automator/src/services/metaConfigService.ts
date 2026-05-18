import { supabase } from '@/integrations/supabase/client';

export interface MetaConfig {
  id: string;
  company_id: string;
  access_token: string;
  meta_business_id: string | null;
  ad_account_id: string | null;
  app_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestConnectionResult {
  success: boolean;
  accounts_count?: number;
  accounts?: { name: string; id: string }[];
  error?: string;
}

async function callMetaProxy(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('meta-api-proxy', {
    body,
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function saveMetaConfig(params: {
  company_id: string;
  access_token: string;
  meta_business_id?: string;
  ad_account_id?: string;
  app_id?: string;
  app_secret?: string;
}) {
  return callMetaProxy({ action: 'save_config', ...params });
}

export async function getMetaConfig(company_id: string): Promise<MetaConfig | null> {
  const data = await callMetaProxy({ action: 'get_config', company_id });
  return data.config || null;
}

export async function testMetaConnection(company_id: string): Promise<TestConnectionResult> {
  return callMetaProxy({ action: 'test_connection', company_id });
}

export async function metaProxyFetch<T>(
  company_id: string,
  endpoint: string,
  params?: Record<string, string>,
): Promise<T> {
  return callMetaProxy({ action: 'proxy', company_id, endpoint, params });
}

/**
 * Server-side paginated fetch — proxy follows paging.next on the server.
 */
export async function metaProxyFetchAllPages<T>(
  company_id: string,
  endpoint: string,
  params?: Record<string, string>,
  maxPages = 10,
): Promise<T[]> {
  return callMetaProxy({
    action: 'proxy_all_pages',
    company_id,
    endpoint,
    params,
    max_pages: maxPages,
  });
}

/**
 * Check if a company has an active Meta configuration in the database.
 */
export async function hasActiveMetaConfig(company_id: string): Promise<boolean> {
  const { data } = await supabase
    .from('meta_configurations')
    .select('id')
    .eq('company_id', company_id)
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}
