import { NotFoundException } from '@nestjs/common';
import { IntegrationBridgeEmitService } from './integration-bridge-emit.service';
import { EmitBridgeEventDto } from './dto/emit-bridge-event.dto';
import { IntegrationEventsService } from '../integration-events/integration-events.service';
import { PrismaService } from '../prisma.service';

describe('IntegrationBridgeEmitService', () => {
  let service: IntegrationBridgeEmitService;
  let prisma: any;
  let events: jest.Mocked<Pick<IntegrationEventsService, 'recordEvent'>>;

  beforeEach(() => {
    prisma = {
      integrationConnection: {
        findFirst: jest.fn(),
      },
    };
    events = { recordEvent: jest.fn() };
    service = new IntegrationBridgeEmitService(
      prisma as PrismaService,
      events as unknown as IntegrationEventsService,
    );
  });

  const dto: EmitBridgeEventDto = {
    connectionId: '00000000-0000-4000-8000-000000000001',
    provider: 'crm',
    eventType: 'crm.lead.created',
    externalId: 'ext-1',
    source: 'crm-imobiliario',
    data: {
      name: 'Lead',
      phone: '+5511999999999',
    },
    idempotencyKey: 'emit:test:1',
  };

  it('rejects when connection is missing or not tenant-scoped', async () => {
    prisma.integrationConnection.findFirst.mockResolvedValue(null);
    await expect(service.emitForTenant('tenant-a', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(events.recordEvent).not.toHaveBeenCalled();
  });

  it('enqueues IntegrationEvent when connection matches tenant', async () => {
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: dto.connectionId,
      tenantId: 'tenant-a',
      provider: 'crm',
      status: 'active',
      tenant: { isActive: true },
    });
    events.recordEvent.mockResolvedValue({
      eventId: 'evt-1',
      alreadyProcessed: false,
    });

    const out = await service.emitForTenant('tenant-a', dto);

    expect(out).toEqual({
      eventId: 'evt-1',
      alreadyProcessed: false,
      tenantId: 'tenant-a',
    });
    expect(prisma.integrationConnection.findFirst).toHaveBeenCalledWith({
      where: {
        id: dto.connectionId,
        tenantId: 'tenant-a',
        provider: 'crm',
        status: 'active',
      },
      include: { tenant: true },
    });
    expect(events.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        connectionId: dto.connectionId,
        provider: 'crm',
        idempotencyKey: 'emit:test:1',
        payload: expect.objectContaining({
          eventType: 'crm.lead.created',
          externalId: 'ext-1',
          source: 'crm-imobiliario',
          data: dto.data,
        }),
      }),
    );
  });
});
