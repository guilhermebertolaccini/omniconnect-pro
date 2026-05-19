import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { PrismaService } from '../prisma.service';
import type { CreateBotifyMetaAccountDto } from './dto/create-botify-meta-account.dto';
import type { UpdateBotifyMetaAccountDto } from './dto/update-botify-meta-account.dto';
import {
  BotifyChannelConfigService,
  type BotifyChannelConfig,
} from './botify-channel-config.service';

export interface BotifyMetaAccountResponse {
  id: string;
  name: string;
  businessManagerId: string;
  metaWabaAccountId: string;
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
}

export interface BotifyMetaAccountCredentials {
  id: string;
  accessToken: string;
  businessManagerId: string;
  metaWabaAccountId: string;
  evolutionApiKey: string;
}

@Injectable()
export class BotifyMetaAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: BridgeSecretCipher,
    private readonly channelConfigService: BotifyChannelConfigService,
  ) {}

  private parseStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim());
  }

  private decryptToken(enc?: string | null): string | undefined {
    if (!enc?.trim()) return undefined;
    try {
      return this.cipher.decrypt(enc);
    } catch {
      return undefined;
    }
  }

  private encryptToken(plain?: string): string | undefined {
    const t = plain?.trim();
    if (!t || t.startsWith('••')) return undefined;
    return this.cipher.encrypt(t);
  }

  mapRow(row: {
    id: string;
    name: string;
    businessManagerId: string | null;
    metaWabaAccountId: string | null;
    accessTokenEnc: string | null;
    webhookCallbackUrl: string | null;
    webhookVerifyToken: string | null;
    webhookEvents: unknown;
    phoneNumberIds: unknown;
    defaultBotId: string | null;
    defaultFlowId: string | null;
    evolutionInstance: string | null;
    evolutionApiKeyEnc: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): BotifyMetaAccountResponse {
    const hasToken = Boolean(row.accessTokenEnc?.trim());
    const hasEvolutionKey = Boolean(row.evolutionApiKeyEnc?.trim());
    return {
      id: row.id,
      name: row.name,
      businessManagerId: row.businessManagerId ?? '',
      metaWabaAccountId: row.metaWabaAccountId ?? '',
      accessToken: hasToken ? '••••••••' : '',
      webhookCallbackUrl: row.webhookCallbackUrl ?? '',
      webhookVerifyToken: row.webhookVerifyToken ?? '',
      webhookEvents: this.parseStringArray(row.webhookEvents),
      phoneNumberIds: this.parseStringArray(row.phoneNumberIds),
      defaultBotId: row.defaultBotId,
      defaultFlowId: row.defaultFlowId ?? '',
      evolutionInstance: row.evolutionInstance ?? '',
      evolutionApiKey: hasEvolutionKey ? '••••••••' : '',
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Credenciais em claro só para UI Chips (Graph API) — tenant-scoped. */
  async getCredentials(
    tenantId: string,
    id: string,
  ): Promise<BotifyMetaAccountCredentials> {
    const row = await this.assertOwned(tenantId, id);
    const accessToken = this.decryptToken(row.accessTokenEnc);
    if (!accessToken) {
      throw new BadRequestException('Meta account has no access token configured');
    }
    return {
      id: row.id,
      accessToken,
      businessManagerId: row.businessManagerId ?? '',
      metaWabaAccountId: row.metaWabaAccountId ?? '',
      evolutionApiKey: this.decryptToken(row.evolutionApiKeyEnc) ?? '',
    };
  }

  /**
   * Config efectivo para envio/routing: meta account + overrides do bot (phoneNumberId).
   */
  async resolveEffectiveChannelForBot(
    tenantId: string,
    bot: { id: string; metaAccountId: string | null; channelConfig: unknown },
  ): Promise<BotifyChannelConfig> {
    const botCfg = this.channelConfigService.parseChannelConfig(bot.channelConfig);

    if (!bot.metaAccountId) {
      return botCfg;
    }

    const account = await this.prisma.botifyMetaAccount.findFirst({
      where: { id: bot.metaAccountId, tenantId },
    });
    if (!account) {
      return botCfg;
    }

    const fromAccount: BotifyChannelConfig = {
      businessAccountId: account.businessManagerId ?? undefined,
      metaWabaAccountId: account.metaWabaAccountId ?? undefined,
      accessToken: this.decryptToken(account.accessTokenEnc),
      webhookSecret: account.webhookVerifyToken ?? undefined,
      evolutionInstance: account.evolutionInstance ?? undefined,
      evolutionApiKey: this.decryptToken(account.evolutionApiKeyEnc),
      defaultFlowId: account.defaultFlowId ?? undefined,
    };

    return {
      ...fromAccount,
      phoneNumberId: botCfg.phoneNumberId ?? fromAccount.phoneNumberId,
      defaultFlowId: botCfg.defaultFlowId ?? fromAccount.defaultFlowId,
      metaWabaAccountId: botCfg.metaWabaAccountId ?? fromAccount.metaWabaAccountId,
      businessAccountId: botCfg.businessAccountId ?? fromAccount.businessAccountId,
    };
  }

  async list(tenantId: string): Promise<BotifyMetaAccountResponse[]> {
    const rows = await this.prisma.botifyMetaAccount.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((r) => this.mapRow(r));
  }

  async getActive(tenantId: string): Promise<BotifyMetaAccountResponse | null> {
    const row = await this.prisma.botifyMetaAccount.findFirst({
      where: { tenantId, isActive: true },
    });
    return row ? this.mapRow(row) : null;
  }

  async get(tenantId: string, id: string): Promise<BotifyMetaAccountResponse> {
    const row = await this.assertOwned(tenantId, id);
    return this.mapRow(row);
  }

  async create(
    tenantId: string,
    dto: CreateBotifyMetaAccountDto,
  ): Promise<BotifyMetaAccountResponse> {
    if (dto.defaultBotId) {
      await this.assertBotInTenant(tenantId, dto.defaultBotId);
    }

    const activate = dto.activate !== false;

    if (activate) {
      await this.prisma.botifyMetaAccount.updateMany({
        where: { tenantId, isActive: true },
        data: { isActive: false },
      });
    }

    const row = await this.prisma.botifyMetaAccount.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        businessManagerId: dto.businessManagerId?.trim() || null,
        metaWabaAccountId: dto.metaWabaAccountId?.trim() || null,
        accessTokenEnc: this.encryptToken(dto.accessToken) ?? null,
        webhookCallbackUrl: dto.webhookCallbackUrl?.trim() || null,
        webhookVerifyToken: dto.webhookVerifyToken?.trim() || null,
        webhookEvents: dto.webhookEvents?.length
          ? (dto.webhookEvents as Prisma.InputJsonValue)
          : undefined,
        phoneNumberIds: dto.phoneNumberIds?.length
          ? (dto.phoneNumberIds as Prisma.InputJsonValue)
          : undefined,
        defaultBotId: dto.defaultBotId ?? null,
        defaultFlowId: dto.defaultFlowId?.trim() || null,
        evolutionInstance: dto.evolutionInstance?.trim() || null,
        evolutionApiKeyEnc: this.encryptToken(dto.evolutionApiKey) ?? null,
        isActive: activate,
      },
    });

    return this.mapRow(row);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateBotifyMetaAccountDto,
  ): Promise<BotifyMetaAccountResponse> {
    const prev = await this.assertOwned(tenantId, id);

    if (dto.defaultBotId) {
      await this.assertBotInTenant(tenantId, dto.defaultBotId);
    }

    const row = await this.prisma.botifyMetaAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.businessManagerId !== undefined
          ? { businessManagerId: dto.businessManagerId.trim() || null }
          : {}),
        ...(dto.metaWabaAccountId !== undefined
          ? { metaWabaAccountId: dto.metaWabaAccountId.trim() || null }
          : {}),
        ...(dto.accessToken !== undefined
          ? {
              accessTokenEnc:
                this.encryptToken(dto.accessToken) ?? prev.accessTokenEnc,
            }
          : {}),
        ...(dto.webhookCallbackUrl !== undefined
          ? { webhookCallbackUrl: dto.webhookCallbackUrl.trim() || null }
          : {}),
        ...(dto.webhookVerifyToken !== undefined
          ? { webhookVerifyToken: dto.webhookVerifyToken.trim() || null }
          : {}),
        ...(dto.webhookEvents !== undefined
          ? { webhookEvents: dto.webhookEvents as Prisma.InputJsonValue }
          : {}),
        ...(dto.phoneNumberIds !== undefined
          ? { phoneNumberIds: dto.phoneNumberIds as Prisma.InputJsonValue }
          : {}),
        ...(dto.defaultBotId !== undefined ? { defaultBotId: dto.defaultBotId } : {}),
        ...(dto.defaultFlowId !== undefined
          ? { defaultFlowId: dto.defaultFlowId.trim() || null }
          : {}),
        ...(dto.evolutionInstance !== undefined
          ? { evolutionInstance: dto.evolutionInstance.trim() || null }
          : {}),
        ...(dto.evolutionApiKey !== undefined
          ? {
              evolutionApiKeyEnc:
                this.encryptToken(dto.evolutionApiKey) ?? prev.evolutionApiKeyEnc,
            }
          : {}),
      },
    });

    return this.mapRow(row);
  }

  async activate(tenantId: string, id: string): Promise<BotifyMetaAccountResponse> {
    await this.assertOwned(tenantId, id);
    await this.prisma.$transaction([
      this.prisma.botifyMetaAccount.updateMany({
        where: { tenantId },
        data: { isActive: false },
      }),
      this.prisma.botifyMetaAccount.update({
        where: { id },
        data: { isActive: true },
      }),
    ]);
    return this.get(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.assertOwned(tenantId, id);
    await this.prisma.botifyBot.updateMany({
      where: { tenantId, metaAccountId: id },
      data: { metaAccountId: null },
    });
    await this.prisma.botifyMetaAccount.delete({ where: { id } });
  }

  async validateEvolutionApiKey(
    tenantId: string,
    instance: string,
    apiKey: string,
  ): Promise<boolean> {
    const row = await this.prisma.botifyMetaAccount.findFirst({
      where: { tenantId, evolutionInstance: instance.trim() },
    });
    if (!row) return false;
    const key = this.decryptToken(row.evolutionApiKeyEnc);
    if (!key?.trim()) return true;
    return key === apiKey.trim();
  }

  async linkBot(
    tenantId: string,
    botId: string,
    metaAccountId: string | null,
  ): Promise<void> {
    await this.assertBotInTenant(tenantId, botId);
    if (metaAccountId) {
      await this.assertOwned(tenantId, metaAccountId);
    }
    await this.prisma.botifyBot.update({
      where: { id: botId },
      data: { metaAccountId },
    });
    if (metaAccountId) {
      await this.prisma.botifyMetaAccount.update({
        where: { id: metaAccountId },
        data: { defaultBotId: botId },
      });
    }
  }

  private async assertOwned(tenantId: string, id: string) {
    const row = await this.prisma.botifyMetaAccount.findFirst({
      where: { id, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Meta account not found');
    }
    return row;
  }

  private async assertBotInTenant(tenantId: string, botId: string) {
    const bot = await this.prisma.botifyBot.findFirst({
      where: { id: botId, tenantId },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    return bot;
  }
}
