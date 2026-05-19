import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';

export interface BotifyChannelConfig {
  businessAccountId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  webhookSecret?: string;
  metaWabaAccountId?: string;
  evolutionInstance?: string;
  evolutionApiKey?: string;
  defaultFlowId?: string;
}

type StoredChannelConfig = Record<string, unknown>;

@Injectable()
export class BotifyChannelConfigService {
  constructor(private readonly cipher: BridgeSecretCipher) {}

  parseChannelConfig(raw: unknown): BotifyChannelConfig {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const o = raw as StoredChannelConfig;
    const pick = (k: string, max: number) => {
      const v = o[k];
      if (typeof v !== 'string') return undefined;
      const t = v.trim();
      return t ? t.slice(0, max) : undefined;
    };

    let accessToken = pick('accessToken', 4096);
    const accessTokenEnc = pick('accessTokenEnc', 8192);
    if (!accessToken && accessTokenEnc) {
      try {
        accessToken = this.cipher.decrypt(accessTokenEnc);
      } catch {
        accessToken = undefined;
      }
    }

    let evolutionApiKey = pick('evolutionApiKey', 4096);
    const evolutionApiKeyEnc = pick('evolutionApiKeyEnc', 8192);
    if (!evolutionApiKey && evolutionApiKeyEnc) {
      try {
        evolutionApiKey = this.cipher.decrypt(evolutionApiKeyEnc);
      } catch {
        evolutionApiKey = undefined;
      }
    }

    return {
      businessAccountId: pick('businessAccountId', 64),
      phoneNumberId: pick('phoneNumberId', 64),
      accessToken,
      webhookSecret: pick('webhookSecret', 255),
      metaWabaAccountId: pick('metaWabaAccountId', 64),
      evolutionInstance: pick('evolutionInstance', 128),
      evolutionApiKey,
      defaultFlowId: pick('defaultFlowId', 64),
    };
  }

  /** Persist secrets encrypted; never store plaintext tokens. */
  toStorageJson(
    prevRaw: unknown,
    patch: BotifyChannelConfig,
  ): Prisma.InputJsonValue {
    const prev = this.parseChannelConfig(prevRaw);
    const next: BotifyChannelConfig = {
      businessAccountId: patch.businessAccountId ?? prev.businessAccountId,
      phoneNumberId: patch.phoneNumberId ?? prev.phoneNumberId,
      accessToken:
        patch.accessToken && !patch.accessToken.startsWith('••')
          ? patch.accessToken
          : prev.accessToken,
      webhookSecret: patch.webhookSecret ?? prev.webhookSecret,
      metaWabaAccountId: patch.metaWabaAccountId ?? prev.metaWabaAccountId,
      evolutionInstance: patch.evolutionInstance ?? prev.evolutionInstance,
      evolutionApiKey:
        patch.evolutionApiKey && !patch.evolutionApiKey.startsWith('••')
          ? patch.evolutionApiKey
          : prev.evolutionApiKey,
      defaultFlowId: patch.defaultFlowId ?? prev.defaultFlowId,
    };

    const stored: StoredChannelConfig = {};
    if (next.businessAccountId) stored.businessAccountId = next.businessAccountId;
    if (next.phoneNumberId) stored.phoneNumberId = next.phoneNumberId;
    if (next.webhookSecret) stored.webhookSecret = next.webhookSecret;
    if (next.metaWabaAccountId) stored.metaWabaAccountId = next.metaWabaAccountId;
    if (next.evolutionInstance) stored.evolutionInstance = next.evolutionInstance;
    if (next.defaultFlowId) stored.defaultFlowId = next.defaultFlowId;

    if (next.accessToken?.trim()) {
      stored.accessTokenEnc = this.cipher.encrypt(next.accessToken.trim());
    } else if (prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)) {
      const prevEnc = (prevRaw as StoredChannelConfig).accessTokenEnc;
      if (typeof prevEnc === 'string' && prevEnc.length > 0) {
        stored.accessTokenEnc = prevEnc;
      }
    }

    if (next.evolutionApiKey?.trim()) {
      stored.evolutionApiKeyEnc = this.cipher.encrypt(next.evolutionApiKey.trim());
    } else if (prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)) {
      const prevEnc = (prevRaw as StoredChannelConfig).evolutionApiKeyEnc;
      if (typeof prevEnc === 'string' && prevEnc.length > 0) {
        stored.evolutionApiKeyEnc = prevEnc;
      }
    }

    return stored as Prisma.InputJsonValue;
  }

  isConnected(cfg: BotifyChannelConfig): boolean {
    return Boolean(cfg.phoneNumberId?.trim() && cfg.accessToken?.trim());
  }

  lineHealth(cfg: BotifyChannelConfig): 'healthy' | 'degraded' | 'disconnected' {
    if (this.isConnected(cfg)) return 'healthy';
    if (
      cfg.phoneNumberId?.trim() ||
      cfg.businessAccountId?.trim() ||
      cfg.metaWabaAccountId?.trim() ||
      cfg.evolutionInstance?.trim()
    ) {
      return 'degraded';
    }
    return 'disconnected';
  }
}
