import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BOTIFY_FLOW_SCHEMA_VERSION,
  type BotifyFlowGraph,
} from '@omniconnect/shared-types';
import { PrismaService } from '../prisma.service';
import type { CreateBotifyBotDto } from './dto/create-bot.dto';
import type { UpdateBotifyBotDto } from './dto/update-bot.dto';
import type { CreateBotifyFlowDto } from './dto/create-flow.dto';
import type { UpdateBotifyFlowDto } from './dto/update-flow.dto';
import type { ImportWordpressSnapshotDto } from './dto/import-wordpress-snapshot.dto';
import { BotifyChannelConfigService } from './botify-channel-config.service';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseFlowGraph(raw: unknown): BotifyFlowGraph {
  if (!raw || typeof raw !== 'object') {
    return { schemaVersion: BOTIFY_FLOW_SCHEMA_VERSION, nodes: [] };
  }
  const nodes = (raw as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) {
    return { schemaVersion: BOTIFY_FLOW_SCHEMA_VERSION, nodes: [] };
  }
  const sv = (raw as { schemaVersion?: unknown }).schemaVersion;
  return {
    schemaVersion:
      typeof sv === 'string' && sv
        ? (sv as typeof BOTIFY_FLOW_SCHEMA_VERSION)
        : BOTIFY_FLOW_SCHEMA_VERSION,
    nodes: nodes as BotifyFlowGraph['nodes'],
  };
}

function emptyDraftGraph(): Prisma.InputJsonValue {
  return {
    schemaVersion: BOTIFY_FLOW_SCHEMA_VERSION,
    nodes: [],
  } as Prisma.InputJsonValue;
}

function nodesToGraphJson(nodes: unknown[] | undefined): Prisma.InputJsonValue {
  return {
    schemaVersion: BOTIFY_FLOW_SCHEMA_VERSION,
    nodes: Array.isArray(nodes) ? nodes : [],
  } as Prisma.InputJsonValue;
}

export interface ListMeta {
  page: number;
  limit: number;
  total: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: ListMeta;
}

export type BotifyBotResponse = ReturnType<BotifyService['mapBot']>;
export type BotifyFlowResponse = ReturnType<BotifyService['mapFlow']>;

@Injectable()
export class BotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelConfigService: BotifyChannelConfigService,
  ) {}

  private clampPagination(page?: number, limit?: number): {
    page: number;
    limit: number;
    skip: number;
  } {
    const p = page && page > 0 ? page : 1;
    const raw = limit && limit > 0 ? limit : DEFAULT_PAGE_SIZE;
    const lim = Math.min(MAX_PAGE_SIZE, raw);
    return { page: p, limit: lim, skip: (p - 1) * lim };
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

  async assertFlowOwned(tenantId: string, flowId: string) {
    const flow = await this.prisma.botifyFlow.findFirst({
      where: { id: flowId, tenantId },
    });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }
    return flow;
  }

  mapBot(row: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    channelConfig?: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const cfg = this.channelConfigService.parseChannelConfig(row.channelConfig);
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      status: row.isActive ? 'online' : 'offline',
      lineHealth: this.channelConfigService.lineHealth(cfg),
      phoneNumber: cfg.phoneNumberId ?? '',
      messagesReceived: 0,
      messagesSent: 0,
      activeConversations: 0,
      lastActivity: row.updatedAt,
      createdAt: row.createdAt,
    };
  }

  mapFlow(row: {
    id: string;
    botId: string;
    name: string;
    triggerKeyword: string | null;
    draftGraph: unknown;
    publishedGraph: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const draft = parseFlowGraph(row.draftGraph);
    return {
      id: row.id,
      botId: row.botId,
      name: row.name,
      triggerKeyword: row.triggerKeyword ?? '',
      nodes: draft.nodes,
      isActive: row.publishedGraph != null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listBots(
    tenantId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<BotifyBotResponse>> {
    const { skip, limit: lim, page: p } = this.clampPagination(page, limit);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.botifyBot.count({ where: { tenantId } }),
      this.prisma.botifyBot.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: lim,
      }),
    ]);
    return {
      data: rows.map((r) => this.mapBot(r)),
      meta: { page: p, limit: lim, total },
    };
  }

  async getBot(tenantId: string, id: string) {
    const row = await this.prisma.botifyBot.findFirst({
      where: { id, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Bot not found');
    }
    return this.mapBot(row);
  }

  async createBot(tenantId: string, dto: CreateBotifyBotDto) {
    const row = await this.prisma.botifyBot.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        externalSourceId: dto.externalSourceId ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    return this.mapBot(row);
  }

  async updateBot(tenantId: string, id: string, dto: UpdateBotifyBotDto) {
    await this.assertBotOwned(tenantId, id);
    const row = await this.prisma.botifyBot.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.externalSourceId !== undefined
          ? { externalSourceId: dto.externalSourceId }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return this.mapBot(row);
  }

  async deleteBot(tenantId: string, id: string) {
    await this.assertBotOwned(tenantId, id);
    await this.prisma.botifyBot.delete({ where: { id } });
  }

  async listFlows(
    tenantId: string,
    botId?: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<BotifyFlowResponse>> {
    const { skip, limit: lim, page: p } = this.clampPagination(page, limit);
    const where: Prisma.BotifyFlowWhereInput = { tenantId };
    if (botId?.trim()) {
      await this.assertBotOwned(tenantId, botId.trim());
      where.botId = botId.trim();
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.botifyFlow.count({ where }),
      this.prisma.botifyFlow.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: lim,
      }),
    ]);
    return {
      data: rows.map((r) => this.mapFlow(r)),
      meta: { page: p, limit: lim, total },
    };
  }

  async getFlow(tenantId: string, id: string) {
    const row = await this.assertFlowOwned(tenantId, id);
    return this.mapFlow(row);
  }

  async createFlow(tenantId: string, dto: CreateBotifyFlowDto) {
    await this.assertBotOwned(tenantId, dto.botId);
    const row = await this.prisma.botifyFlow.create({
      data: {
        tenantId,
        botId: dto.botId,
        name: dto.name,
        triggerKeyword: dto.triggerKeyword ?? null,
        externalSourceId: dto.externalSourceId ?? null,
        draftGraph: nodesToGraphJson(dto.nodes as unknown[] | undefined),
      },
    });
    return this.mapFlow(row);
  }

  async updateFlow(tenantId: string, id: string, dto: UpdateBotifyFlowDto) {
    const existing = await this.assertFlowOwned(tenantId, id);
    if (dto.botId && dto.botId !== existing.botId) {
      await this.assertBotOwned(tenantId, dto.botId);
    }

    let draftGraph: Prisma.InputJsonValue | undefined;
    if (dto.nodes !== undefined) {
      draftGraph = nodesToGraphJson(dto.nodes as unknown[]);
    }

    const row = await this.prisma.botifyFlow.update({
      where: { id },
      data: {
        ...(dto.botId !== undefined ? { botId: dto.botId } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.triggerKeyword !== undefined
          ? { triggerKeyword: dto.triggerKeyword }
          : {}),
        ...(draftGraph !== undefined ? { draftGraph } : {}),
      },
    });
    return this.mapFlow(row);
  }

  async deleteFlow(tenantId: string, id: string) {
    await this.assertFlowOwned(tenantId, id);
    await this.prisma.botifyFlow.delete({ where: { id } });
  }

  async publishFlow(tenantId: string, id: string) {
    const flow = await this.assertFlowOwned(tenantId, id);
    const draft = flow.draftGraph ?? emptyDraftGraph();
    const nextVersion = (flow.publishedVersion ?? 0) + 1;
    const row = await this.prisma.botifyFlow.update({
      where: { id },
      data: {
        publishedGraph: draft as Prisma.InputJsonValue,
        publishedAt: new Date(),
        publishedVersion: nextVersion,
      },
    });
    return this.mapFlow(row);
  }

  async unpublishFlow(tenantId: string, id: string) {
    const flow = await this.assertFlowOwned(tenantId, id);
    const row = await this.prisma.botifyFlow.update({
      where: { id },
      data: {
        publishedGraph: null,
        publishedAt: null,
        publishedVersion: 0,
      },
    });
    return this.mapFlow(row);
  }

  async getRuntimeFlowConfig(tenantId: string, flowId: string) {
    const flow = await this.assertFlowOwned(tenantId, flowId);
    const raw = flow.publishedGraph ?? flow.draftGraph;
    const graph = parseFlowGraph(raw);
    return {
      id: flow.id,
      botId: flow.botId,
      name: flow.name,
      triggerKeyword: flow.triggerKeyword ?? '',
      nodes: graph.nodes,
      publishedVersion: flow.publishedVersion,
    };
  }

  async importWordpressSnapshot(tenantId: string, dto: ImportWordpressSnapshotDto) {
    if (!dto.bots?.length) {
      throw new BadRequestException('Import requires at least one bot');
    }

    const botIdByExternal = new Map<string, string>();
    const results = { botsUpserted: 0, flowsUpserted: 0 };

    for (const b of dto.bots) {
      const row = await this.prisma.botifyBot.upsert({
        where: {
          tenantId_externalSourceId: {
            tenantId,
            externalSourceId: b.externalSourceId,
          },
        },
        create: {
          tenantId,
          name: b.name,
          description: b.description ?? null,
          externalSourceId: b.externalSourceId,
          isActive: true,
        },
        update: {
          name: b.name,
          ...(b.description !== undefined ? { description: b.description } : {}),
        },
      });
      botIdByExternal.set(b.externalSourceId, row.id);
      results.botsUpserted += 1;
    }

    for (const f of dto.flows ?? []) {
      const botInternalId = botIdByExternal.get(f.botExternalSourceId);
      if (!botInternalId) {
        throw new BadRequestException(
          `Unknown botExternalSourceId: ${f.botExternalSourceId}`,
        );
      }
      await this.prisma.botifyFlow.upsert({
        where: {
          tenantId_externalSourceId: {
            tenantId,
            externalSourceId: f.externalSourceId,
          },
        },
        create: {
          tenantId,
          botId: botInternalId,
          name: f.name,
          triggerKeyword: f.triggerKeyword ?? null,
          externalSourceId: f.externalSourceId,
          draftGraph: nodesToGraphJson(f.nodes as unknown[]),
        },
        update: {
          botId: botInternalId,
          name: f.name,
          ...(f.triggerKeyword !== undefined
            ? { triggerKeyword: f.triggerKeyword }
            : {}),
          draftGraph: nodesToGraphJson(f.nodes as unknown[]),
        },
      });
      results.flowsUpserted += 1;
    }

    return results;
  }
}
