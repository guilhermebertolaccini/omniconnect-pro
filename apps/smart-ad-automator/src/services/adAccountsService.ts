// ==========================================
// Ad Accounts Service — Meta Marketing API
// ==========================================

import { fetchAllPages, metaFetch } from './metaApi';
import type { MetaAdAccountRaw } from '@/types/metaApiTypes';
import { mapAccountStatus } from '@/types/metaApiTypes';
import type { AdAccount } from '@/types/campaign';

const ACCOUNT_FIELDS = [
  'id',
  'name',
  'account_status',
  'currency',
  'timezone_name',
  'amount_spent',
  'balance',
  'business_name',
].join(',');

/**
 * Fetch all ad accounts linked to the authenticated user.
 */
export async function fetchAdAccounts(companyId: string): Promise<AdAccount[]> {
  const raw = await fetchAllPages<MetaAdAccountRaw>(
    companyId,
    '/me/adaccounts',
    { fields: ACCOUNT_FIELDS, limit: '50' },
  );

  return raw.map(mapRawToAdAccount);
}

/**
 * Fetch details of a single ad account.
 */
export async function fetchAdAccountDetails(companyId: string, accountId: string): Promise<AdAccount> {
  const id = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const raw = await metaFetch<MetaAdAccountRaw>(
    companyId,
    `/${id}`,
    { fields: ACCOUNT_FIELDS },
  );

  return mapRawToAdAccount(raw);
}

/** Map raw Meta response to local AdAccount type */
function mapRawToAdAccount(raw: MetaAdAccountRaw): AdAccount {
  return {
    id: raw.id.replace('act_', ''),
    name: raw.name || raw.id,
    businessName: raw.business_name || raw.name || '',
    currency: raw.currency || 'BRL',
    timezone: raw.timezone_name || 'America/Sao_Paulo',
    status: mapAccountStatus(raw.account_status),
    lastSync: new Date().toISOString(),
    totalSpent: parseInt(raw.amount_spent || '0', 10) / 100,
    activeCampaigns: 0,
  };
}
