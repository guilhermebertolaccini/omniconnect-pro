/**
 * Contas Meta/Evolution — fonte única no omniconnect-backend (`/botify/meta-accounts`).
 * Chips UI usa este serviço; localStorage só para migração legada one-shot.
 */
import { omniconnectBotifyApi } from './omniconnect-botify-api';

export interface WebhookConfig {
  callbackUrl: string;
  verifyToken: string;
  isConfigured: boolean;
  lastVerified?: string;
  subscribedEvents: string[];
}

export interface MetaAccount {
  id: string;
  name: string;
  businessManagerId: string;
  accessToken: string;
  metaWabaAccountId?: string;
  createdAt: string;
  lastUsed?: string;
  isActive: boolean;
  webhookConfig?: WebhookConfig;
  phoneNumberIds?: string[];
  defaultBotId?: string | null;
  defaultFlowId?: string;
  evolutionInstance?: string;
  evolutionApiKey?: string;
}

const LEGACY_STORAGE_KEY = 'meta_accounts';

function mapApiToMetaAccount(row: {
  id: string;
  name: string;
  businessManagerId: string;
  metaWabaAccountId?: string;
  accessToken: string;
  webhookCallbackUrl: string;
  webhookVerifyToken: string;
  webhookEvents: string[];
  phoneNumberIds: string[];
  defaultBotId: string | null;
  defaultFlowId: string;
  evolutionInstance: string;
  evolutionApiKey: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}): MetaAccount {
  return {
    id: row.id,
    name: row.name,
    businessManagerId: row.businessManagerId,
    accessToken: row.accessToken,
    metaWabaAccountId: row.metaWabaAccountId,
    createdAt: row.createdAt,
    lastUsed: row.updatedAt,
    isActive: row.isActive,
    phoneNumberIds: row.phoneNumberIds,
    defaultBotId: row.defaultBotId,
    defaultFlowId: row.defaultFlowId,
    evolutionInstance: row.evolutionInstance,
    evolutionApiKey: row.evolutionApiKey,
    webhookConfig: {
      callbackUrl: row.webhookCallbackUrl,
      verifyToken: row.webhookVerifyToken,
      isConfigured: Boolean(row.webhookCallbackUrl && row.webhookVerifyToken),
      subscribedEvents: row.webhookEvents?.length
        ? row.webhookEvents
        : ['messages', 'messaging_postbacks'],
    },
  };
}

function readLegacyAccounts(): Array<{
  name: string;
  businessManagerId: string;
  accessToken: string;
  metaWabaAccountId?: string;
}> {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{
      name?: string;
      businessManagerId?: string;
      accessToken?: string;
      metaWabaAccountId?: string;
    }>;
    return parsed
      .filter((a) => a.accessToken?.trim() && a.businessManagerId?.trim())
      .map((a) => ({
        name: a.name?.trim() || 'Conta importada',
        businessManagerId: a.businessManagerId!.trim(),
        accessToken: a.accessToken!.trim(),
        metaWabaAccountId: a.metaWabaAccountId?.trim(),
      }));
  } catch {
    return [];
  }
}

class MetaAccountsService {
  private cache: MetaAccount[] = [];

  async loadAccounts(): Promise<MetaAccount[]> {
    const rows = await omniconnectBotifyApi.listMetaAccounts();
    this.cache = rows.map(mapApiToMetaAccount);
    return [...this.cache];
  }

  getAccounts(): MetaAccount[] {
    return [...this.cache];
  }

  getActiveAccount(): MetaAccount | null {
    return this.cache.find((a) => a.isActive) ?? this.cache[0] ?? null;
  }

  getAccountById(id: string): MetaAccount | undefined {
    return this.cache.find((a) => a.id === id);
  }

  hasAccounts(): boolean {
    return this.cache.length > 0;
  }

  /** Token em claro para chamadas Graph API no browser (tenant JWT). */
  async getAccessTokenForGraph(accountId: string): Promise<string> {
    const creds = await omniconnectBotifyApi.getMetaAccountCredentials(accountId);
    return creds.accessToken;
  }

  async addAccount(data: {
    name: string;
    businessManagerId: string;
    accessToken: string;
    metaWabaAccountId?: string;
    activate?: boolean;
  }): Promise<MetaAccount> {
    const row = await omniconnectBotifyApi.createMetaAccount({
      name: data.name,
      businessManagerId: data.businessManagerId,
      accessToken: data.accessToken,
      metaWabaAccountId: data.metaWabaAccountId,
      activate: data.activate !== false,
    });
    await this.loadAccounts();
    return mapApiToMetaAccount(row);
  }

  async updateAccount(
    id: string,
    data: Partial<{
      name: string;
      businessManagerId: string;
      accessToken: string;
      metaWabaAccountId: string;
      webhookConfig: WebhookConfig;
      phoneNumberIds: string[];
      defaultBotId: string | null;
      defaultFlowId: string;
      evolutionInstance: string;
      evolutionApiKey: string;
    }>,
  ): Promise<MetaAccount | null> {
    const row = await omniconnectBotifyApi.updateMetaAccount(id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.businessManagerId !== undefined
        ? { businessManagerId: data.businessManagerId }
        : {}),
      ...(data.accessToken !== undefined ? { accessToken: data.accessToken } : {}),
      ...(data.metaWabaAccountId !== undefined
        ? { metaWabaAccountId: data.metaWabaAccountId }
        : {}),
      ...(data.webhookConfig
        ? {
            webhookCallbackUrl: data.webhookConfig.callbackUrl,
            webhookVerifyToken: data.webhookConfig.verifyToken,
            webhookEvents: data.webhookConfig.subscribedEvents,
          }
        : {}),
      ...(data.phoneNumberIds !== undefined ? { phoneNumberIds: data.phoneNumberIds } : {}),
      ...(data.defaultBotId !== undefined ? { defaultBotId: data.defaultBotId } : {}),
      ...(data.defaultFlowId !== undefined ? { defaultFlowId: data.defaultFlowId } : {}),
      ...(data.evolutionInstance !== undefined
        ? { evolutionInstance: data.evolutionInstance }
        : {}),
      ...(data.evolutionApiKey !== undefined ? { evolutionApiKey: data.evolutionApiKey } : {}),
    });
    await this.loadAccounts();
    return mapApiToMetaAccount(row);
  }

  async setActiveAccount(id: string): Promise<MetaAccount | null> {
    const row = await omniconnectBotifyApi.activateMetaAccount(id);
    await this.loadAccounts();
    return mapApiToMetaAccount(row);
  }

  async deleteAccount(id: string): Promise<boolean> {
    await omniconnectBotifyApi.deleteMetaAccount(id);
    await this.loadAccounts();
    return true;
  }

  /** Migra contas do localStorage para o Omni (uma vez, se API vazia). */
  async migrateLegacyLocalStorageIfEmpty(): Promise<number> {
    const existing = await this.loadAccounts();
    if (existing.length > 0) return 0;

    const legacy = readLegacyAccounts();
    let imported = 0;
    for (const [i, acc] of legacy.entries()) {
      await this.addAccount({
        ...acc,
        activate: i === 0,
      });
      imported += 1;
    }
    if (imported > 0) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    return imported;
  }
}

export const metaAccountsService = new MetaAccountsService();
