import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrmLeadStage, Prisma } from '@prisma/client';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';
import { PrismaService } from '../prisma.service';
import {
  BridgeEventPayload,
  LoadedIntegrationEvent,
  parseBridgeEventPayload,
} from './bridge-event-contract';
import type { IntegrationProvider } from './integration-events.service';
import { InsightAiService } from '../insight-ai/insight-ai.service';

interface IntegrationEntityLinkDelegate {
  findUnique(args: {
    where: {
      tenantId_provider_externalId_entityType: {
        tenantId: string;
        provider: string;
        externalId: string;
        entityType: string;
      };
    };
    select: { entityId: true };
  }): Promise<{ entityId: string } | null>;
  create(args: {
    data: {
      tenantId: string;
      provider: string;
      externalId: string;
      entityType: string;
      entityId: string;
    };
  }): Promise<unknown>;
}

type PrismaWithIntegrationEntityLink = PrismaService & {
  integrationEntityLink: IntegrationEntityLinkDelegate;
};

@Injectable()
export class BridgeEventDispatcherService {
  private readonly logger = new Logger(BridgeEventDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemEvents: SystemEventsService,
    private readonly config: ConfigService,
    private readonly insightAi: InsightAiService,
  ) {}

  private get entityLinks(): IntegrationEntityLinkDelegate {
    return (this.prisma as PrismaWithIntegrationEntityLink).integrationEntityLink;
  }

  async dispatch(
    event: LoadedIntegrationEvent,
    expectedProvider: IntegrationProvider,
  ): Promise<void> {
    if (event.tenantId === undefined || event.tenantId === null) {
      throw new Error('IntegrationEvent missing tenantId');
    }
    if (event.provider !== expectedProvider) {
      throw new Error(
        `IntegrationEvent provider mismatch: expected ${expectedProvider}, got ${event.provider}`,
      );
    }
    if (event.status === 'processed') {
      return;
    }
    const payload = parseBridgeEventPayload(expectedProvider, event.payload);
    await this.dispatchByType(event, payload);
    this.logger.log(
      `Dispatched ${payload.eventType} for tenant=${event.tenantId} event=${event.id}`,
    );
    await this.systemEvents.logEvent(
      EventType.BRIDGE_EVENT_DISPATCHED,
      EventModule.BRIDGE_PROCESSORS,
      {
        eventId: event.id,
        provider: event.provider,
        eventType: payload.eventType,
        externalId: payload.externalId,
        source: payload.source ?? null,
      },
      null,
      EventSeverity.SUCCESS,
      event.tenantId,
    );
  }

  private async dispatchByType(
    event: LoadedIntegrationEvent,
    payload: BridgeEventPayload,
  ) {
    switch (payload.eventType) {
      case 'crm.lead.created':
        await this.upsertCrmLead(event, payload, 'crm');
        return;
      case 'crm.lead.updated':
        await this.updateCrmLead(event, payload, 'crm');
        return;
      case 'ads.lead.created':
        await this.upsertCrmLead(event, payload, 'ads');
        return;
      case 'botify.handoff.created':
        await this.createBotifyHandoff(event, payload);
        return;
      default: {
        const _exhaustive: never = payload.eventType as never;
        throw new Error(`Unhandled bridge eventType ${_exhaustive}`);
      }
    }
  }

  private async upsertCrmLead(
    event: LoadedIntegrationEvent,
    payload: BridgeEventPayload,
    sourceProvider: 'crm' | 'ads',
  ) {
    const existingLink = await this.findEntityLink(
      event.tenantId,
      sourceProvider,
      payload.externalId,
      'CrmLead',
    );
    if (existingLink) {
      await this.prisma.crmLead.update({
        where: { id: existingLink.entityId },
        data: this.crmLeadUpdateData(payload, sourceProvider),
      });
      return;
    }
    const lead = await this.prisma.crmLead.create({
      data: {
        tenantId: event.tenantId,
        ...this.crmLeadData(payload, sourceProvider),
      },
      select: { id: true },
    });
    await this.createEntityLink(
      event.tenantId,
      sourceProvider,
      payload.externalId,
      'CrmLead',
      lead.id,
    );
  }

  private async updateCrmLead(
    event: LoadedIntegrationEvent,
    payload: BridgeEventPayload,
    sourceProvider: 'crm' | 'ads',
  ) {
    const existingLink = await this.findEntityLink(
      event.tenantId,
      sourceProvider,
      payload.externalId,
      'CrmLead',
    );
    if (!existingLink) {
      await this.upsertCrmLead(event, payload, sourceProvider);
      return;
    }
    await this.prisma.crmLead.update({
      where: { id: existingLink.entityId },
      data: this.crmLeadUpdateData(payload, sourceProvider),
    });
  }

  private async createBotifyHandoff(
    event: LoadedIntegrationEvent,
    payload: BridgeEventPayload,
  ) {
    const phone = this.stringFromData(payload.data, 'phone', 40);
    if (!phone) {
      throw new Error('botify.handoff.created requires data.phone');
    }
    const leadSummary = this.botifyLeadSummaryFromData(payload.data);
    const name =
      this.stringFromData(payload.data, 'name', 255) ??
      this.stringFromData(payload.data, 'contactName', 255) ??
      phone;
    const segment = this.numberFromData(payload.data, 'segment');
    await this.prisma.contact.upsert({
      where: {
        tenantId_phone: {
          tenantId: event.tenantId,
          phone,
        },
      },
      update: { name },
      create: {
        tenantId: event.tenantId,
        phone,
        name,
        segment,
      },
    });
    const message =
      this.stringFromData(payload.data, 'message', 2000) ??
      'Handoff solicitado pelo Botify';
    const existingLink = await this.findEntityLink(
      event.tenantId,
      'bot',
      payload.externalId,
      'MessageQueue',
    );
    if (existingLink) {
      return;
    }
    const queued = await this.prisma.messageQueue.create({
      data: {
        tenantId: event.tenantId,
        contactPhone: phone,
        contactName: name,
        message,
        ...(leadSummary !== undefined ? { leadSummary } : {}),
        messageType: 'text',
        segment,
        status: 'pending',
      },
      select: { id: true },
    });
    await this.createEntityLink(
      event.tenantId,
      'bot',
      payload.externalId,
      'MessageQueue',
      String(queued.id),
    );
    await this.maybeEnqueueInsightAiAfterBotifyHandoff(event.tenantId, phone);
  }

  /**
   * Optional: prime InsightAI for the same E.164 after a new handoff row is created.
   * Analysis reads messages persisted in Omni for that tenant+phone; the first run may
   * be sparse until the human conversation exists — jobId hour-bucket allows re-run.
   */
  private async maybeEnqueueInsightAiAfterBotifyHandoff(
    tenantId: string,
    contactPhone: string,
  ): Promise<void> {
    const flag = this.config.get<string>('INSIGHT_AI_ON_BOTIFY_HANDOFF');
    if (flag !== 'true' && flag !== '1') return;
    try {
      await this.insightAi.enqueueAnalyzeByPhone(tenantId, contactPhone, {
        days: 14,
        limit: 80,
        persist: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `InsightAI enqueue after Botify handoff failed for tenant=${tenantId}: ${msg}`,
      );
    }
  }

  private crmLeadData(
    payload: BridgeEventPayload,
    sourceProvider: 'crm' | 'ads',
  ): Prisma.CrmLeadUncheckedCreateWithoutTenantInput {
    const name =
      this.stringFromData(payload.data, 'name', 255) ??
      this.stringFromData(payload.data, 'contactName', 255) ??
      `Lead ${payload.externalId}`;
    const source =
      this.stringFromData(payload.data, 'source', 80) ??
      payload.source ??
      sourceProvider;
    return {
      name,
      email: this.stringFromData(payload.data, 'email', 255)?.toLowerCase() ?? null,
      phone: this.stringFromData(payload.data, 'phone', 40) ?? null,
      source,
      stage: this.stageFromData(payload.data) ?? CrmLeadStage.new,
      propertyInterest: this.stringFromData(payload.data, 'propertyInterest', 255) ?? null,
      estimatedValue: this.decimalFromData(payload.data, 'estimatedValue'),
      notes: this.stringFromData(payload.data, 'notes', 1800) ?? null,
    };
  }

  private crmLeadUpdateData(
    payload: BridgeEventPayload,
    sourceProvider: 'crm' | 'ads',
  ): Prisma.CrmLeadUncheckedUpdateInput {
    const data: Prisma.CrmLeadUncheckedUpdateInput = {};
    const source =
      this.stringFromData(payload.data, 'source', 80) ??
      payload.source ??
      sourceProvider;
    if (source) data.source = source;
    const stage = this.stageFromData(payload.data);
    if (stage) data.stage = stage;
    const propertyInterest = this.stringFromData(payload.data, 'propertyInterest', 255);
    if (propertyInterest) data.propertyInterest = propertyInterest;
    const estimatedValue = this.decimalFromData(payload.data, 'estimatedValue');
    if (estimatedValue !== undefined) data.estimatedValue = estimatedValue;
    return data;
  }

  /**
   * Whitelist + size caps for Botify `data.leadSummary` (nested object).
   * Aligns conceptually with triage fields in @omniconnect-pro/ai-contracts (LeadIntent, etc.) as free-text hints.
   */
  private botifyLeadSummaryFromData(
    data: Record<string, unknown>,
  ): Prisma.InputJsonValue | undefined {
    const raw = data.leadSummary;
    if (raw == null) return undefined;
    if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const put = (key: string, max: number) => {
      const v = this.stringFromData(o, key, max);
      if (v) out[key] = v;
    };
    put('intent', 80);
    put('urgency', 32);
    put('budget', 120);
    put('region', 120);
    put('propertyInterest', 255);
    put('notes', 500);
    put('flowId', 120);
    put('flowName', 120);
    put('lastUserMessage', 600);
    put('lastAssistantReply', 600);
    const cf = o.collectedFields;
    if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
      const collected: Record<string, string> = {};
      let n = 0;
      for (const [k, v] of Object.entries(cf)) {
        if (n >= 15) break;
        if (typeof k !== 'string' || !k.trim()) continue;
        if (typeof v !== 'string') continue;
        const t = v.trim().slice(0, 200);
        if (t) collected[k.trim().slice(0, 60)] = t;
        n++;
      }
      if (Object.keys(collected).length) out.collectedFields = collected;
    }
    return Object.keys(out).length > 0 ? (out as Prisma.InputJsonValue) : undefined;
  }

  private stringFromData(
    data: Record<string, unknown>,
    key: string,
    maxLength: number,
  ): string | undefined {
    const value = data[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
  }

  private numberFromData(data: Record<string, unknown>, key: string): number | undefined {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return undefined;
  }

  private decimalFromData(
    data: Record<string, unknown>,
    key: string,
  ): Prisma.Decimal | undefined {
    const value = this.numberFromData(data, key);
    return value === undefined ? undefined : new Prisma.Decimal(value);
  }

  private stageFromData(data: Record<string, unknown>): CrmLeadStage | undefined {
    const stage = this.stringFromData(data, 'stage', 40);
    if (!stage) return undefined;
    return Object.values(CrmLeadStage).includes(stage as CrmLeadStage)
      ? (stage as CrmLeadStage)
      : undefined;
  }

  private async findEntityLink(
    tenantId: string,
    provider: IntegrationProvider,
    externalId: string,
    entityType: string,
  ) {
    return this.entityLinks.findUnique({
      where: {
        tenantId_provider_externalId_entityType: {
          tenantId,
          provider,
          externalId,
          entityType,
        },
      },
      select: { entityId: true },
    });
  }

  private async createEntityLink(
    tenantId: string,
    provider: IntegrationProvider,
    externalId: string,
    entityType: string,
    entityId: string,
  ) {
    await this.entityLinks.create({
      data: {
        tenantId,
        provider,
        externalId,
        entityType,
        entityId,
      },
    });
  }
}
