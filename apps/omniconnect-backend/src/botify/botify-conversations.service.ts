import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BotifyMessageRole, Prisma } from '@prisma/client';
import { WhatsappCloudService } from '../whatsapp-cloud/whatsapp-cloud.service';
import { PrismaService } from '../prisma.service';
import type { AppendBotifyMessageDto } from './dto/append-botify-message.dto';
import type { ResolveBotifyConversationDto } from './dto/resolve-botify-conversation.dto';
import type { PaginatedResult } from './botify.service';
import {
  BotifyChannelConfigService,
  type BotifyChannelConfig,
} from './botify-channel-config.service';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) {
    throw new BadRequestException('contactPhone is required');
  }
  return trimmed.replace(/\s+/g, '');
}

export type { BotifyChannelConfig };

@Injectable()
export class BotifyConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappCloud: WhatsappCloudService,
    private readonly channelConfigService: BotifyChannelConfigService,
  ) {}

  parseChannelConfig(raw: unknown): BotifyChannelConfig {
    return this.channelConfigService.parseChannelConfig(raw);
  }

  async getBotChannel(tenantId: string, botId: string) {
    const bot = await this.assertBotOwned(tenantId, botId);
    const cfg = this.parseChannelConfig(bot.channelConfig);
    return {
      botId: bot.id,
      businessAccountId: cfg.businessAccountId ?? '',
      phoneNumberId: cfg.phoneNumberId ?? '',
      accessToken: cfg.accessToken ? '••••••••' : '',
      evolutionApiKey: cfg.evolutionApiKey ? '••••••••' : '',
      webhookSecret: cfg.webhookSecret ?? '',
      metaWabaAccountId: cfg.metaWabaAccountId ?? '',
      evolutionInstance: cfg.evolutionInstance ?? '',
      defaultFlowId: cfg.defaultFlowId ?? '',
      webhookUrl: `${process.env.APP_URL ?? 'http://localhost:3001'}/webhooks/meta`,
      isConnected: this.channelConfigService.isConnected(cfg),
      lineHealth: this.channelConfigService.lineHealth(cfg),
    };
  }

  async updateBotChannel(
    tenantId: string,
    botId: string,
    patch: BotifyChannelConfig,
  ) {
    await this.assertBotOwned(tenantId, botId);
    const existing = await this.prisma.botifyBot.findFirst({
      where: { id: botId, tenantId },
      select: { channelConfig: true },
    });
    await this.prisma.botifyBot.update({
      where: { id: botId },
      data: {
        channelConfig: this.channelConfigService.toStorageJson(
          existing?.channelConfig,
          patch,
        ),
      },
    });
    return this.getBotChannel(tenantId, botId);
  }

  private clampPagination(page?: number, limit?: number) {
    const p = page && page > 0 ? page : 1;
    const raw = limit && limit > 0 ? limit : DEFAULT_PAGE_SIZE;
    const lim = Math.min(MAX_PAGE_SIZE, raw);
    return { page: p, limit: lim, skip: (p - 1) * lim };
  }

  private mapConversation(
    row: {
      id: string;
      tenantId: string;
      botId: string;
      contactPhone: string;
      contactName: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    lastMsg?: { content: string; role: BotifyMessageRole; createdAt: Date } | null,
  ) {
    return {
      id: row.id,
      botId: row.botId,
      contactPhone: row.contactPhone,
      contactName: row.contactName,
      lastMessage: lastMsg?.content ?? '',
      lastMessageTime: (lastMsg?.createdAt ?? row.updatedAt).toISOString(),
      unreadCount: 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapMessage(row: {
    id: string;
    conversationId: string;
    role: BotifyMessageRole;
    content: string;
    metadata: unknown;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      conversationId: row.conversationId,
      role: row.role,
      content: row.content,
      direction: row.role === 'user' ? 'incoming' : 'outgoing',
      metadata: row.metadata ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async assertBotOwned(tenantId: string, botId: string) {
    const bot = await this.prisma.botifyBot.findFirst({
      where: { id: botId, tenantId },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    return bot;
  }

  async assertConversationOwned(tenantId: string, conversationId: string) {
    const row = await this.prisma.botifyConversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Conversation not found');
    }
    return row;
  }

  async resolveConversation(tenantId: string, dto: ResolveBotifyConversationDto) {
    await this.assertBotOwned(tenantId, dto.botId);
    const contactPhone = normalizePhone(dto.contactPhone);
    const contactName = dto.contactName?.trim() || contactPhone;

    const row = await this.prisma.botifyConversation.upsert({
      where: {
        tenantId_botId_contactPhone: {
          tenantId,
          botId: dto.botId,
          contactPhone,
        },
      },
      create: {
        tenantId,
        botId: dto.botId,
        contactPhone,
        contactName,
      },
      update: {
        ...(dto.contactName !== undefined ? { contactName } : {}),
      },
    });

    return { id: row.id, data: this.mapConversation(row, null) };
  }

  async listConversations(
    tenantId: string,
    botId?: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<ReturnType<typeof this.mapConversation>>> {
    if (botId) {
      await this.assertBotOwned(tenantId, botId);
    }
    const { page: p, limit: lim, skip } = this.clampPagination(page, limit);
    const where: Prisma.BotifyConversationWhereInput = { tenantId };
    if (botId) where.botId = botId;

    const [total, rows] = await Promise.all([
      this.prisma.botifyConversation.count({ where }),
      this.prisma.botifyConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: lim,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
        },
      }),
    ]);

    return {
      data: rows.map((r) =>
        this.mapConversation(r, r.messages[0] ?? null),
      ),
      meta: { page: p, limit: lim, total },
    };
  }

  async listMessages(
    tenantId: string,
    conversationId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<ReturnType<typeof this.mapMessage>>> {
    await this.assertConversationOwned(tenantId, conversationId);
    const { page: p, limit: lim, skip } = this.clampPagination(page, limit);

    const where = { tenantId, conversationId };
    const [total, rows] = await Promise.all([
      this.prisma.botifyMessage.count({ where }),
      this.prisma.botifyMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: lim,
      }),
    ]);

    return {
      data: rows.map((r) => this.mapMessage(r)),
      meta: { page: p, limit: lim, total },
    };
  }

  /** Chronological slice for microservice AI context (newest last). */
  async listMessagesForRuntime(
    tenantId: string,
    conversationId: string,
    limit = 40,
  ) {
    await this.assertConversationOwned(tenantId, conversationId);
    const lim = Math.min(80, Math.max(1, limit));
    const rows = await this.prisma.botifyMessage.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: lim,
    });
    return rows.reverse().map((r) => ({
      direction: r.role === 'user' ? 'incoming' : 'outgoing',
      content: r.content,
      mediaUrl: null as string | null,
    }));
  }

  async appendMessage(
    tenantId: string,
    conversationId: string,
    dto: AppendBotifyMessageDto,
  ) {
    const conv = await this.assertConversationOwned(tenantId, conversationId);
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('content is required');
    }

    const metadata =
      dto.metadata === undefined
        ? undefined
        : (dto.metadata as Prisma.InputJsonValue);

    const [message] = await this.prisma.$transaction([
      this.prisma.botifyMessage.create({
        data: {
          tenantId,
          conversationId,
          role: dto.role,
          content,
          ...(metadata !== undefined ? { metadata } : {}),
        },
      }),
      this.prisma.botifyConversation.update({
        where: { id: conv.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    return this.mapMessage(message);
  }

  /**
   * Outbound WhatsApp via `BotifyBot.channelConfig` (Meta Cloud API).
   */
  async sendConversationMessage(
    tenantId: string,
    conversationId: string,
    content: string,
  ) {
    const conv = await this.assertConversationOwned(tenantId, conversationId);
    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('content is required');
    }

    const bot = await this.assertBotOwned(tenantId, conv.botId);
    const channel = this.parseChannelConfig(bot.channelConfig);
    if (!channel.phoneNumberId?.trim() || !channel.accessToken?.trim()) {
      return {
        success: false,
        error: 'CHANNEL_NOT_CONFIGURED',
        message:
          'Configure phoneNumberId and accessToken em PATCH /botify/bots/:id/channel',
      };
    }

    try {
      await this.whatsappCloud.sendTextMessage({
        phoneNumberId: channel.phoneNumberId,
        token: channel.accessToken,
        to: conv.contactPhone,
        message: trimmed,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: 'SEND_FAILED', message: msg };
    }

    const saved = await this.appendMessage(tenantId, conversationId, {
      role: BotifyMessageRole.assistant,
      content: trimmed,
    });

    return { success: true, messageId: saved.id };
  }
}
