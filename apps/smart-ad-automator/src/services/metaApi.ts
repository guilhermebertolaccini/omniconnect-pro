// ==========================================
// Meta Graph API — Proxy-based Client
// ==========================================
// All calls go through the edge function proxy (meta-api-proxy).
// The access token is stored securely in the database, never in the browser.

import { metaProxyFetch } from './metaConfigService';
import type { MetaApiResponse } from '@/types/metaApiTypes';

/**
 * Core fetch wrapper — delegates to the edge function proxy.
 *
 * @param companyId - company UUID (used to look up the token server-side)
 * @param endpoint  - e.g. "/me/adaccounts" or "/act_123/campaigns"
 * @param params    - query parameters (fields, limit, etc.)
 */
export async function metaFetch<T>(
  companyId: string,
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  return metaProxyFetch<T>(companyId, endpoint, params);
}

/**
 * Fetch all pages of a paginated Meta API response.
 * Delegates to the proxy's `proxy_all_pages` action for server-side pagination.
 *
 * @param companyId - company UUID
 * @param endpoint  - initial endpoint
 * @param params    - query parameters
 * @param maxPages  - safety limit (default 10)
 */
export async function fetchAllPages<T>(
  companyId: string,
  endpoint: string,
  params: Record<string, string> = {},
  maxPages = 10,
): Promise<T[]> {
  const { metaProxyFetchAllPages } = await import('./metaConfigService');
  return metaProxyFetchAllPages<T>(companyId, endpoint, params, maxPages);
}
