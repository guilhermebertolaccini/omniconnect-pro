import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BOTIFY_FLOW_SCHEMA_VERSION,
  type BotifyFlowGraph,
  type BotifyLeadSummary,
} from '@omniconnect/shared-types';
import { PrismaService } from '../prisma.service';
import { IntegrationBridgeEmitService } from '../integration-bridge-emit/integration-bridge-emit.service';
import { findFlowEntryNode, resolveNextNodeId } from './botify-flow-navigation';
import type { BotifyFlow } from '@prisma/client';

export interface BotifyEngineRunOptions {
  dryRun: boolean;
  /** Dígitos ou E.164 — obrigatório para handoff real (`dryRun: false`). */
  phone?: string;
  conversationId?: string;
}

export interface BotifyEngineStep {
  nodeId: string;
  type: string;
  detail?: Record<string, unknown>;
}

export interface BotifyEngineResult {
  flowId: string;
  steps: BotifyEngineStep[];
  outboundMessages: string[];
  handoffEmitted?: boolean;
}

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

function mergeActionNodeConfig(node: {
  data?: Record<string, unknown>;
}): Record<string, unknown> {
  const raw =
    node?.data !== undefined &&
    typeof node.data === 'object' &&
    node.data !== null &&
    !Array.isArray(node.data)
      ? { ...(node.data as Record<string, unknown>) }
      : {};
  const nested = (raw as { config?: unknown }).config;
  if (
    nested &&
    typeof nested === 'object' &&
    nested !== null &&
    !Array.isArray(nested)
  ) {
    return { ...raw, ...(nested as Record<string, unknown>) };
  }
  return raw;
}

function buildHandoffLeadSummary(
  merged: Record<string, unknown>,
  context: { flowId?: string; text?: string; lastAssistantReply?: string },
): BotifyLeadSummary | undefined {
  const pick = (key: string, max: number): string | undefined => {
    const v = merged[key];
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    if (!t) return undefined;
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };
  const summary: BotifyLeadSummary = {};
  const intent = pick('intent', 80);
  if (intent) summary.intent = intent;
  const urgency = pick('urgency', 32);
  if (urgency) summary.urgency = urgency;
  const budget = pick('budget', 120);
  if (budget) summary.budget = budget;
  const region = pick('region', 120);
  if (region) summary.region = region;
  const propertyInterest = pick('propertyInterest', 255);
  if (propertyInterest) summary.propertyInterest = propertyInterest;
  const notes = pick('notes', 500);
  if (notes) summary.notes = notes;
  const flowName = pick('flowName', 120);
  if (flowName) summary.flowName = flowName;

  if (context.flowId?.trim()) {
    summary.flowId = context.flowId.trim().slice(0, 120);
  }
  if (context.text?.trim()) {
    const t = context.text.trim();
    summary.lastUserMessage = t.length > 600 ? `${t.slice(0, 599)}…` : t;
  }
  if (context.lastAssistantReply?.trim()) {
    const t = context.lastAssistantReply.trim();
    summary.lastAssistantReply = t.length > 600 ? `${t.slice(0, 599)}…` : t;
  }
  return Object.keys(summary).length ? summary : undefined;
}

@Injectable()
export class BotifyFlowEngineService {
  private readonly logger = new Logger(BotifyFlowEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bridgeEmit: IntegrationBridgeEmitService,
  ) {}

  private pickRuntimeGraph(flow: BotifyFlow): BotifyFlowGraph {
    const raw = flow.publishedGraph ?? flow.draftGraph;
    return parseFlowGraph(raw);
  }

  async run(
    tenantId: string,
    flowId: string,
    userText: string,
    opts: BotifyEngineRunOptions,
  ): Promise<BotifyEngineResult> {
    const flow = await this.prisma.botifyFlow.findFirst({
      where: { id: flowId, tenantId },
    });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }

    const graph = this.pickRuntimeGraph(flow);
    const nodes = graph.nodes as unknown as Array<Record<string, unknown>>;
    const start = findFlowEntryNode(nodes);
    if (!start || typeof start.id !== 'string') {
      throw new NotFoundException('Flow has no executable entry node');
    }

    const outboundMessages: string[] = [];
    const steps: BotifyEngineStep[] = [];
    const handoffFlag = { emitted: false };
    const context: {
      text?: string;
      flowId: string;
      lastAssistantReply?: string;
    } = { text: userText, flowId };

    let current: Record<string, unknown> | null = start;
    let guard = 0;

    while (current && guard++ < 64) {
      const id = String(current.id);
      const type = String(current.type ?? '');
      steps.push({ nodeId: id, type });

      try {
        await this.executeSingleNode(
          tenantId,
          flow,
          current,
          context,
          outboundMessages,
          steps,
          opts,
          handoffFlag,
        );
      } catch (err) {
        this.logger.warn(
          `Botify engine stopped at node ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        break;
      }

      const nextId = resolveNextNodeId(
        {
          type,
          data: current.data as { condition?: string } | undefined,
          connections: current.connections,
        },
        context,
      );
      if (!nextId) {
        break;
      }
      current = nodes.find((n) => String(n.id) === nextId) ?? null;
      if (!current) {
        this.logger.warn(`Next node not found: ${nextId}`);
        break;
      }
    }

    return {
      flowId,
      steps,
      outboundMessages,
      handoffEmitted: handoffFlag.emitted,
    };
  }

  private async executeSingleNode(
    tenantId: string,
    flow: BotifyFlow,
    node: Record<string, unknown>,
    context: { text?: string; flowId: string; lastAssistantReply?: string },
    outboundMessages: string[],
    steps: BotifyEngineStep[],
    opts: BotifyEngineRunOptions,
    handoffFlag: { emitted: boolean },
  ): Promise<void> {
    const type = String(node.type ?? '');
    const data =
      node.data && typeof node.data === 'object'
        ? (node.data as Record<string, unknown>)
        : {};

    switch (type) {
      case 'start':
        return;

      case 'message': {
        const content = typeof data.content === 'string' ? data.content.trim() : '';
        if (content) {
          outboundMessages.push(content);
        }
        return;
      }

      case 'delay': {
        const delayMs = parseInt(String(data.delayMs ?? 1000), 10);
        const last = steps[steps.length - 1];
        if (last) {
          last.detail = {
            delayMs: Number.isNaN(delayMs) ? 0 : delayMs,
            skipped: opts.dryRun,
          };
        }
        if (!opts.dryRun && !Number.isNaN(delayMs) && delayMs > 0) {
          await new Promise((r) => setTimeout(r, Math.min(delayMs, 60_000)));
        }
        return;
      }

      case 'condition':
        return;

      case 'ai': {
        const lastAi = steps[steps.length - 1];
        if (lastAi) {
          lastAi.detail = {
            note: 'Backend engine does not run LLM; use microserviço or future AI service.',
          };
        }
        return;
      }

      case 'buttons':
      case 'list':
      case 'media': {
        this.logger.warn(`Node type '${type}' — motor backend MVP não envia rich media.`);
        return;
      }

      case 'action': {
        const actionType = typeof data.actionType === 'string' ? data.actionType : '';
        if (actionType === 'transfer') {
          const merged = mergeActionNodeConfig({ data });
          const message =
            typeof merged.message === 'string' && merged.message.trim()
              ? String(merged.message).trim()
              : 'Handoff solicitado pelo Botify';
          const name =
            typeof merged.contactName === 'string' && merged.contactName.trim()
              ? String(merged.contactName).trim()
              : undefined;
          const segment =
            typeof merged.segment === 'number'
              ? merged.segment
              : typeof merged.segment === 'string' && /^\d+$/.test(merged.segment)
                ? parseInt(String(merged.segment), 10)
                : undefined;
          const conv = opts.conversationId?.trim() || 'backend';
          const externalId = `botify:flow:${flow.id}:conv:${conv}:transfer`;
          const leadSummary = buildHandoffLeadSummary(merged, context);

          if (opts.dryRun) {
            const lastAct = steps[steps.length - 1];
            if (lastAct) {
              lastAct.detail = {
                transfer: true,
                wouldEmit: true,
                externalId,
              };
            }
            return;
          }

          const phoneRaw = opts.phone?.trim();
          if (!phoneRaw) {
            this.logger.warn('transfer node: phone missing; skip handoff emit');
            return;
          }
          const digits = phoneRaw.replace(/\D/g, '');
          const phone = digits.length >= 10 ? `+${digits}` : phoneRaw;

          const connection = await this.prisma.integrationConnection.findFirst({
            where: { tenantId, provider: 'bot', status: 'active' },
            orderBy: { createdAt: 'asc' },
          });
          if (!connection) {
            this.logger.warn(
              `No active bot IntegrationConnection for tenant ${tenantId}; skip handoff`,
            );
            return;
          }

          await this.bridgeEmit.emitForTenant(tenantId, {
            connectionId: connection.id,
            provider: 'bot',
            eventType: 'botify.handoff.created',
            externalId,
            source: 'omniconnect-botify-engine',
            data: {
              phone,
              ...(name ? { name } : {}),
              message,
              ...(segment != null ? { segment } : {}),
              ...(leadSummary ? { leadSummary } : {}),
            },
            idempotencyKey: `botify:handoff:${externalId}`,
          });
          handoffFlag.emitted = true;
          return;
        }
        this.logger.debug(`Action node '${actionType}' has no backend handler`);
        return;
      }

      default:
        this.logger.warn(`Unknown node type: ${type}`);
    }
  }
}
