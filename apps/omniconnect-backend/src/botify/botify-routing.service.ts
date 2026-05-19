import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BotifyChannelConfigService } from './botify-channel-config.service';

export interface BotifyWebhookRouting {
  botId: string;
  flowId: string | null;
}

@Injectable()
export class BotifyRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelConfig: BotifyChannelConfigService,
  ) {}

  private matchMetaAccount(
    cfg: ReturnType<BotifyChannelConfigService['parseChannelConfig']>,
    accountId: string,
  ): boolean {
    const id = accountId.trim();
    if (!id) return false;
    return (
      cfg.metaWabaAccountId === id ||
      cfg.businessAccountId === id ||
      cfg.phoneNumberId === id
    );
  }

  async resolveMetaAccount(
    tenantId: string,
    accountId: string,
  ): Promise<BotifyWebhookRouting> {
    const bots = await this.prisma.botifyBot.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, channelConfig: true },
    });

    for (const bot of bots) {
      const cfg = this.channelConfig.parseChannelConfig(bot.channelConfig);
      if (this.matchMetaAccount(cfg, accountId)) {
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
    try {
      const routing = await this.resolveEvolutionInstance(tenantId, instance);
      const bot = await this.prisma.botifyBot.findFirst({
        where: { id: routing.botId, tenantId },
        select: { channelConfig: true },
      });
      if (!bot) return false;
      const cfg = this.channelConfig.parseChannelConfig(bot.channelConfig);
      if (!cfg.evolutionApiKey?.trim()) {
        return true;
      }
      return cfg.evolutionApiKey === apiKey.trim();
    } catch {
      return false;
    }
  }
}
