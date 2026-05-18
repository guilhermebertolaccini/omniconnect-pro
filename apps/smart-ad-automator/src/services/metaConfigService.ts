/**
 * Sprint 2.4 — Bloco E. `metaConfigService` agora fala com o backend
 * (`/advertiser-companies/:id/platforms/meta/proxy`) em vez do edge function
 * `meta-api-proxy`. Mantém as funções exportadas com o mesmo shape para reduzir
 * mudanças no resto do código.
 *
 * Diferença principal: nada de "saveMetaConfig" com access_token cru. O token
 * só entra via OAuth (server-side em /oauth/meta/start). Esta camada continua
 * sendo o proxy autenticado para chamar a Graph API com tenant scope.
 */

import { request, type AdPlatform } from '@/lib/omniconnectClient';
import {
  getPlatformConnection,
  type PlatformConnection,
} from './platformConfigService';

const PLATFORM: AdPlatform = 'meta';

export interface MetaConfig {
  id: string;
  company_id: string;
  access_token: string; // mascarado: "••••XXXX" ou null
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

function toMetaConfig(c: PlatformConnection): MetaConfig {
  const extra = (c.extra as Record<string, unknown>) ?? {};
  return {
    id: c.id,
    company_id: c.advertiserCompanyId,
    access_token: c.accessTokenHint ? `••••${c.accessTokenHint}` : null,
    meta_business_id: (extra.meta_business_id as string) ?? null,
    ad_account_id: c.accountId ?? (extra.ad_account_id as string) ?? null,
    app_id: (extra.app_id as string) ?? null,
    is_active: c.isActive,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  } as MetaConfig;
}

export async function getMetaConfig(advertiserCompanyId: string): Promise<MetaConfig | null> {
  const c = await getPlatformConnection(PLATFORM, advertiserCompanyId);
  return c ? toMetaConfig(c) : null;
}

export async function hasActiveMetaConfig(advertiserCompanyId: string): Promise<boolean> {
  const c = await getPlatformConnection(PLATFORM, advertiserCompanyId);
  return !!c && c.isActive && c.hasAccessToken;
}

async function proxyCall<T>(
  advertiserCompanyId: string,
  body: {
    endpoint: string;
    method?: 'GET' | 'POST' | 'DELETE';
    params?: Record<string, string>;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  return request<T>(
    `/advertiser-companies/${advertiserCompanyId}/platforms/meta/proxy`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function testMetaConnection(
  advertiserCompanyId: string,
): Promise<TestConnectionResult> {
  try {
    const r = await proxyCall<{
      data?: { name: string; id: string }[];
    }>(advertiserCompanyId, { endpoint: '/me/adaccounts', method: 'GET' });
    const accounts = r?.data ?? [];
    return { success: true, accounts_count: accounts.length, accounts };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

export async function metaProxyFetch<T>(
  advertiserCompanyId: string,
  endpoint: string,
  params?: Record<string, string>,
): Promise<T> {
  return proxyCall<T>(advertiserCompanyId, {
    endpoint,
    method: 'GET',
    params,
  });
}

/**
 * Server-side pagination não está implementada como um endpoint dedicado no
 * backend. Por ora seguimos `paging.next` no cliente, fazendo cada hop pelo
 * próprio proxy autenticado. O backend continua sendo o único que vê o token.
 */
export async function metaProxyFetchAllPages<T>(
  advertiserCompanyId: string,
  endpoint: string,
  params?: Record<string, string>,
  maxPages = 10,
): Promise<T[]> {
  const collected: T[] = [];
  let nextParams: Record<string, string> | undefined = params;
  let nextEndpoint = endpoint;
  for (let i = 0; i < maxPages; i++) {
    const page = await proxyCall<{
      data?: T[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(advertiserCompanyId, { endpoint: nextEndpoint, method: 'GET', params: nextParams });
    if (Array.isArray(page?.data)) collected.push(...(page.data as T[]));
    const after = page?.paging?.cursors?.after;
    if (!after || !page?.paging?.next) break;
    nextParams = { ...(params ?? {}), after };
    nextEndpoint = endpoint;
  }
  return collected;
}

/**
 * `saveMetaConfig` virou no-op deprecado: salvar token diretamente não é mais
 * suportado. Mantido como stub para não quebrar imports do legado; lança erro
 * informativo se chamado.
 */
export async function saveMetaConfig(_params: {
  company_id: string;
  access_token?: string;
  meta_business_id?: string;
  ad_account_id?: string;
  app_id?: string;
  app_secret?: string;
}): Promise<never> {
  throw new Error(
    'saveMetaConfig is deprecated — connect Meta via OAuth in Settings.',
  );
}
