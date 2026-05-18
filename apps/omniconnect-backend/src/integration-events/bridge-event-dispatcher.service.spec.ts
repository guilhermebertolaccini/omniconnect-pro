import { BadRequestException } from '@nestjs/common';
import { BridgeEventDispatcherService } from './bridge-event-dispatcher.service';
import { parseBridgeEventPayload } from './bridge-event-contract';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';
import { PrismaService } from '../prisma.service';

describe('BridgeEventDispatcherService', () => {
  let service: BridgeEventDispatcherService;
  let prisma: any;
  let systemEvents: jest.Mocked<Pick<SystemEventsService, 'logEvent'>>;

  beforeEach(() => {
    prisma = {
      crmLead: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'lead-1' }),
        update: jest.fn().mockResolvedValue({ id: 'lead-1' }),
      },
      integrationEntityLink: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'link-1' }),
      },
      contact: {
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
      },
      messageQueue: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    systemEvents = { logEvent: jest.fn().mockResolvedValue(undefined) };
    service = new BridgeEventDispatcherService(
      prisma as unknown as PrismaService,
      systemEvents as unknown as SystemEventsService,
    );
  });

  it('creates and logs a supported CRM bridge event without PII payload in SystemEvent', async () => {
    prisma.integrationEntityLink.findUnique.mockResolvedValue(null);
    await service.dispatch(
      {
        id: 'evt-1',
        tenantId: 'tenant-a',
        provider: 'crm',
        status: 'received',
        payload: {
          eventType: 'crm.lead.created',
          externalId: 'lead-ext-1',
          occurredAt: '2026-05-18T22:00:00.000Z',
          source: 'crm-imobiliario',
          data: { name: 'Cliente com PII que nao deve ir ao SystemEvent' },
        },
      },
      'crm',
    );

    expect(prisma.crmLead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        name: 'Cliente com PII que nao deve ir ao SystemEvent',
      }),
      select: { id: true },
    });
    expect(prisma.integrationEntityLink.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        provider: 'crm',
        externalId: 'lead-ext-1',
        entityType: 'CrmLead',
        entityId: 'lead-1',
      },
    });
    expect(systemEvents.logEvent).toHaveBeenCalledWith(
      EventType.BRIDGE_EVENT_DISPATCHED,
      EventModule.BRIDGE_PROCESSORS,
      {
        eventId: 'evt-1',
        provider: 'crm',
        eventType: 'crm.lead.created',
        externalId: 'lead-ext-1',
        source: 'crm-imobiliario',
      },
      null,
      EventSeverity.SUCCESS,
      'tenant-a',
    );
    const systemEventData = systemEvents.logEvent.mock.calls[0][2];
    expect(JSON.stringify(systemEventData)).not.toContain('Cliente com PII');
  });

  it('updates an existing CRM lead by tenant-scoped bridge marker instead of creating a duplicate', async () => {
    prisma.integrationEntityLink.findUnique.mockResolvedValue({
      entityId: 'lead-existing',
    });
    await service.dispatch(
      {
        id: 'evt-1',
        tenantId: 'tenant-a',
        provider: 'crm',
        status: 'received',
        payload: {
          eventType: 'crm.lead.updated',
          externalId: 'lead-ext-1',
          occurredAt: '2026-05-18T22:00:00.000Z',
          data: { stage: 'qualified', name: 'Nao sobrescrever PII' },
        },
      },
      'crm',
    );

    expect(prisma.integrationEntityLink.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_provider_externalId_entityType: {
          tenantId: 'tenant-a',
          provider: 'crm',
          externalId: 'lead-ext-1',
          entityType: 'CrmLead',
        },
      },
      select: { entityId: true },
    });
    expect(prisma.crmLead.create).not.toHaveBeenCalled();
    expect(prisma.crmLead.update).toHaveBeenCalledWith({
      where: { id: 'lead-existing' },
      data: expect.objectContaining({ stage: 'qualified' }),
    });
    expect(prisma.crmLead.update.mock.calls[0][0].data).not.toHaveProperty('name');
  });

  it('creates an ads lead with ads marker and campaign source fields', async () => {
    prisma.integrationEntityLink.findUnique.mockResolvedValue(null);
    await service.dispatch(
      {
        id: 'evt-ads',
        tenantId: 'tenant-a',
        provider: 'ads',
        status: 'received',
        payload: {
          eventType: 'ads.lead.created',
          externalId: 'meta-lead-1',
          occurredAt: '2026-05-18T22:00:00.000Z',
          source: 'meta_ads',
          data: {
            name: 'Lead Meta',
            phone: '+5511999999999',
            source: 'campanha-maio',
          },
        },
      },
      'ads',
    );

    expect(prisma.crmLead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        name: 'Lead Meta',
        phone: '+5511999999999',
        source: 'campanha-maio',
      }),
      select: { id: true },
    });
  });

  it('turns a botify handoff into tenant-scoped contact and pending message queue', async () => {
    prisma.integrationEntityLink.findUnique.mockResolvedValue(null);
    await service.dispatch(
      {
        id: 'evt-bot',
        tenantId: 'tenant-a',
        provider: 'bot',
        status: 'received',
        payload: {
          eventType: 'botify.handoff.created',
          externalId: 'handoff-1',
          occurredAt: '2026-05-18T22:00:00.000Z',
          data: {
            phone: '+5511888888888',
            name: 'Lead Bot',
            message: 'Precisa falar com humano',
            segment: 7,
          },
        },
      },
      'bot',
    );

    expect(prisma.contact.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_phone: {
          tenantId: 'tenant-a',
          phone: '+5511888888888',
        },
      },
      update: { name: 'Lead Bot' },
      create: {
        tenantId: 'tenant-a',
        phone: '+5511888888888',
        name: 'Lead Bot',
        segment: 7,
      },
    });
    expect(prisma.messageQueue.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        contactPhone: '+5511888888888',
        contactName: 'Lead Bot',
        message: 'Precisa falar com humano',
        messageType: 'text',
        segment: 7,
        status: 'pending',
      },
      select: { id: true },
    });
    expect(prisma.integrationEntityLink.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        provider: 'bot',
        externalId: 'handoff-1',
        entityType: 'MessageQueue',
        entityId: '1',
      },
    });
  });

  it('does not enqueue a duplicated botify handoff with same externalId', async () => {
    prisma.integrationEntityLink.findUnique.mockResolvedValue({
      entityId: 'queue-1',
    });
    await service.dispatch(
      {
        id: 'evt-bot-dup',
        tenantId: 'tenant-a',
        provider: 'bot',
        status: 'received',
        payload: {
          eventType: 'botify.handoff.created',
          externalId: 'handoff-1',
          occurredAt: '2026-05-18T22:00:00.000Z',
          data: {
            phone: '+5511888888888',
            name: 'Lead Bot',
          },
        },
      },
      'bot',
    );

    expect(prisma.messageQueue.create).not.toHaveBeenCalled();
    expect(prisma.integrationEntityLink.create).not.toHaveBeenCalled();
  });

  it('rejects provider mismatch before dispatch', async () => {
    await expect(
      service.dispatch(
        {
          id: 'evt-1',
          tenantId: 'tenant-a',
          provider: 'ads',
          status: 'received',
          payload: {
            eventType: 'ads.lead.created',
            externalId: 'x',
            occurredAt: new Date().toISOString(),
            data: {},
          },
        },
        'crm',
      ),
    ).rejects.toThrow(/provider mismatch/);
  });

  it('rejects unsupported eventType for provider', () => {
    expect(() =>
      parseBridgeEventPayload('crm', {
        eventType: 'ads.lead.created',
        externalId: 'x',
        occurredAt: new Date().toISOString(),
        data: {},
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid payload shape', () => {
    expect(() => parseBridgeEventPayload('bot', { hello: 'world' })).toThrow(
      BadRequestException,
    );
  });
});
