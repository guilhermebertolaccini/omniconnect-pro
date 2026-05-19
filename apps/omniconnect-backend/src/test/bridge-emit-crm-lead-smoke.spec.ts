/**
 * Smoke: authenticated bridge emit → CRM queue job → dispatcher → CrmLead + IntegrationEntityLink.
 *
 * Bull runs asynchronously in production; here the in-memory queue calls
 * `CrmEventProcessor.handle` synchronously to prove the full wiring without Redis.
 */
import { ConfigService } from '@nestjs/config';
import { BridgeEventDispatcherService } from '../integration-events/bridge-event-dispatcher.service';
import { IntegrationEventsService } from '../integration-events/integration-events.service';
import { IntegrationBridgeEmitService } from '../integration-bridge-emit/integration-bridge-emit.service';
import { CrmEventProcessor } from '../integration-events/jobs/crm-event.processor';
import { SystemEventsService } from '../system-events/system-events.service';
import { PrismaService } from '../prisma.service';
import { InsightAiService } from '../insight-ai/insight-ai.service';

describe('Bridge emit → CRM processor → CrmLead (smoke)', () => {
  it('creates a tenant-scoped CrmLead and entity link end-to-end', async () => {
    const tenantId = 'tenant-bridge-smoke';
    const connectionId = 'conn-bridge-smoke-crm';

    type IEvt = {
      id: string;
      tenantId: string;
      connectionId: string;
      provider: string;
      idempotencyKey: string;
      signature: string | null;
      payload: unknown;
      status: string;
    };

    const events: IEvt[] = [];
    const leads: Array<Record<string, unknown>> = [];
    const links: Array<Record<string, unknown>> = [];
    let eventSeq = 0;

    const prisma: any = {
      integrationConnection: {
        findFirst: async ({ where }: any) => {
          if (
            where.id === connectionId &&
            where.tenantId === tenantId &&
            where.provider === 'crm' &&
            where.status === 'active'
          ) {
            return {
              id: connectionId,
              tenantId,
              provider: 'crm',
              status: 'active',
              tenant: { isActive: true },
            };
          }
          return null;
        },
      },
      integrationEvent: {
        findUnique: async ({ where }: any) => {
          const k = where.tenantId_provider_idempotencyKey;
          if (!k) return null;
          return (
            events.find(
              (e) =>
                e.tenantId === k.tenantId &&
                e.provider === k.provider &&
                e.idempotencyKey === k.idempotencyKey,
            ) ?? null
          );
        },
        create: async ({ data }: any) => {
          const id = `ievt-${++eventSeq}`;
          events.push({
            id,
            tenantId: data.tenantId,
            connectionId: data.connectionId,
            provider: data.provider,
            idempotencyKey: data.idempotencyKey,
            signature: data.signature ?? null,
            payload: data.payload,
            status: 'received',
          });
          return { id };
        },
        findFirst: async ({ where }: any) => {
          const e = events.find(
            (ev) =>
              ev.id === where.id &&
              ev.tenantId === where.tenantId &&
              ev.provider === where.provider,
          );
          if (!e) return null;
          return {
            id: e.id,
            tenantId: e.tenantId,
            provider: e.provider,
            status: e.status,
            payload: e.payload,
          };
        },
        updateMany: async () => ({ count: 1 }),
      },
      crmLead: {
        create: async ({ data }: any) => {
          const id = `lead-${leads.length + 1}`;
          leads.push({ id, ...data });
          return { id };
        },
        update: jest.fn(),
      },
      integrationEntityLink: {
        findUnique: async ({ where }: any) => {
          const w = where.tenantId_provider_externalId_entityType;
          const row = links.find(
            (l) =>
              l.tenantId === w.tenantId &&
              l.provider === w.provider &&
              l.externalId === w.externalId &&
              l.entityType === w.entityType,
          );
          return row ? { entityId: row.entityId } : null;
        },
        create: async ({ data }: any) => {
          links.push({ ...data });
          return { id: 'link-1' };
        },
      },
    };

    const systemEvents = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as SystemEventsService;

    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const insightAi = {
      enqueueAnalyzeByPhone: jest.fn().mockResolvedValue({
        jobId: 'iai:mock',
        tenantId,
        contactPhone: '',
        status: 'queued' as const,
      }),
    } as unknown as InsightAiService;

    const dispatcher = new BridgeEventDispatcherService(
      prisma as unknown as PrismaService,
      systemEvents,
      config,
      insightAi,
    );

    const crmQueue = {
      add: jest.fn(
        async (_name: string, data: { eventId: string; tenantId: string }) => {
          await processor.handle({ data } as any);
        },
      ),
    };
    const adsQueue = { add: jest.fn() };
    const botQueue = { add: jest.fn() };

    const eventsService = new IntegrationEventsService(
      prisma as unknown as PrismaService,
      crmQueue as any,
      adsQueue as any,
      botQueue as any,
    );

    const processor = new CrmEventProcessor(eventsService, dispatcher);

    const emitService = new IntegrationBridgeEmitService(
      prisma as unknown as PrismaService,
      eventsService,
    );

    await emitService.emitForTenant(tenantId, {
      connectionId,
      provider: 'crm',
      eventType: 'crm.lead.created',
      externalId: 'crm-imobiliario:lead:smoke-1',
      source: 'crm-imobiliario',
      data: { name: 'Smoke Lead', source: 'e2e' },
      idempotencyKey: 'smoke-bridge-emit-1',
    });

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      tenantId,
      name: 'Smoke Lead',
      source: 'e2e',
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      tenantId,
      provider: 'crm',
      externalId: 'crm-imobiliario:lead:smoke-1',
      entityType: 'CrmLead',
      entityId: 'lead-1',
    });
    expect(crmQueue.add).toHaveBeenCalled();
  });
});
