import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BotifyChannelConfigService } from './botify-channel-config.service';
import { BotifyMetaAccountsService } from './botify-meta-accounts.service';

export interface BotifyWebhookRouting {
  botId: string;
  flowId: string | null;
}

@Injectable()
export class BotifyRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelConfig: BotifyChannelConfigService,
    private readonly metaAccounts: BotifyMetaAccountsService,
  ) {}

  private parsePhoneIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  }

  private matchMetaAccount(
    row: {
      metaWabaAccountId: string | null;
      businessManagerId: string | null;
      phoneNumberIds: unknown;
      defaultBotId: string | null;
      defaultFlowId: string | null;
    },
    accountId: string,
  ): boolean {
    const id = accountId.trim();
    if (!id) return false;
    if (row.metaWabaAccountId === id || row.businessManagerId === id) {
      return true;
    }
    return this.parsePhoneIds(row.phoneNumberIds).includes(id);
  }

  async resolveMetaAccount(
    tenantId: string,
    accountId: string,
  ): Promise<BotifyWebhookRouting> {
    const metaAccounts = await this.prisma.botifyMetaAccount.findMany({
      where: { tenantId },
    });

    for (const account of metaAccounts) {
      if (this.matchMetaAccount(account, accountId)) {
        const botId =
          account.defaultBotId ??
          (await this.findBotByMetaAccountId(tenantId, account.id));
        if (!botId) {
          throw new NotFoundException('Meta account has no linked bot');
        }
        return {
          botId,
          flowId: account.defaultFlowId?.trim() || null,
        };
      }
    }

    const bots = await this.prisma.botifyBot.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, channelConfig: true },
    });

    for (const bot of bots) {
      const cfg = this.channelConfig.parseChannelConfig(bot.channelConfig);
      if (
        cfg.metaWabaAccountId === accountId.trim() ||
        cfg.businessAccountId === accountId.trim() ||
        cfg.phoneNumberId === accountId.trim()
      ) {
        return {
          botId: bot.id,
          flowId: cfg.defaultFlowId?.trim() || null,
        };
      }
    }

    throw new NotFoundException('No bot routing for Meta account');
  }

  async resolveEvolutionInstance(
    tenantId: string,
    instance: string,
  ): Promise<BotifyWebhookRouting> {
    const name = instance.trim();
    if (!name) {
      throw new NotFoundException('Invalid evolution instance');
    }

    const metaAccount = await this.prisma.botifyMetaAccount.findFirst({
      where: { tenantId, evolutionInstance: name },
    });
    if (metaAccount) {
      const botId =
        metaAccount.defaultBotId ??
        (await this.findBotByMetaAccountId(tenantId, metaAccount.id));
      if (!botId) {
        throw new NotFoundException('Evolution meta account has no linked bot');
      }
      return {
        botId,
        flowId: metaAccount.defaultFlowId?.trim() || null,
      };
    }

    const bots = await this.prisma.botifyBot.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, channelConfig: true },
    });

    for (const bot of bots) {
      const cfg = this.channelConfig.parseChannelConfig(bot.channelConfig);
      if (cfg.evolutionInstance === name) {
        return {
          botId: bot.id,
          flowId: cfg.defaultFlowId?.trim() || null,
        };
      }
    }

    throw new NotFoundException('No bot routing for Evolution instance');
  }

  async validateEvolutionApiKey(
    tenantId: string,
    instance: string,
    apiKey: string,
  ): Promise<boolean> {
    if (!apiKey?.trim()) return false;
    if (await this.metaAccounts.validateEvolutionApiKey(tenantId, instance, apiKey)) {
      return true;
    }
    try {
      const routing = await this.resolveEvolutionInstance(tenantId, instance);
      const bot = await this.prisma.botifyBot.findFirst({
        where: { id: routing.botId, tenantId },
        select: { channelConfig: true },
      });
      if (!bot) return false;
      const cfg = this.channelConfig.parseChannelConfig(bot.channelConfig);
      if (!cfg.evolutionApiKey?.trim()) return true;
      return cfg.evolutionApiKey === apiKey.trim();
    } catch {
      return false;
    }
  }

  private async findBotByMetaAccountId(
    tenantId: string,
    metaAccountId: string,
  ): Promise<string | null> {
    const bot = await this.prisma.botifyBot.findFirst({
      where: { tenantId, metaAccountId, isActive: true },
      select: { id: true },
    });
    return bot?.id ?? null;
  }
}
