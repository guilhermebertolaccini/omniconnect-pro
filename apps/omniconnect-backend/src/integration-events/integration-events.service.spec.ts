import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { IntegrationEventsService } from './integration-events.service';
import { PrismaService } from '../prisma.service';

describe('IntegrationEventsService', () => {
  let service: IntegrationEventsService;
  let prisma: any;
  let crmQueue: any;
  let adsQueue: any;
  let botQueue: any;

  beforeEach(async () => {
    prisma = {
      integrationEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'jid' }) });
    crmQueue = makeQueue();
    adsQueue = makeQueue();
    botQueue = makeQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationEventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken('crm-events'), useValue: crmQueue },
        { provide: getQueueToken('ads-events'), useValue: adsQueue },
        { provide: getQueueToken('bot-events'), useValue: botQueue },
      ],
    }).compile();

    service = module.get(IntegrationEventsService);
  });

  describe('recordEvent — idempotency is (tenantId, provider, key)', () => {
    it('persists a new event when no row exists for (tenant, provider, key)', async () => {
      prisma.integrationEvent.findUnique.mockResolvedValue(null);
      prisma.integrationEvent.create.mockResolvedValue({ id: 'evt-1' });

      const out = await service.recordEvent({
        tenantId: 'tenant-a',
        connectionId: 'conn-1',
        provider: 'crm',
        idempotencyKey: 'k-1',
        payload: { hello: 'world' } as any,
      });

      expect(out).toEqual({ eventId: 'evt-1', alreadyProcessed: false });
      expect(prisma.integrationEvent.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_provider_idempotencyKey: {
            tenantId: 'tenant-a',
            provider: 'crm',
            idempotencyKey: 'k-1',
          },
        },
        select: { id: true, status: true },
      });
      expect(crmQueue.add).toHaveBeenCalled();
    });

    it('returns alreadyProcessed=true for the same (tenant, provider, key)', async () => {
      prisma.integrationEvent.findUnique.mockResolvedValue({ id: 'evt-dup', status: 'processed' });
      const out = await service.recordEvent({
        tenantId: 'tenant-a',
        connectionId: 'conn-1',
        provider: 'crm',
        idempotencyKey: 'k-1',
        payload: {} as any,
      });
      expect(out).toEqual({ eventId: 'evt-dup', alreadyProcessed: true });
      expect(prisma.integrationEvent.create).not.toHaveBeenCalled();
      expect(crmQueue.add).not.toHaveBeenCalled();
    });

    it('DOES NOT cross-bleed: same key on different tenants is two distinct events', async () => {
      // First tenant
      prisma.integrationEvent.findUnique.mockResolvedValueOnce(null);
      prisma.integrationEvent.create.mockResolvedValueOnce({ id: 'evt-a' });
      const outA = await service.recordEvent({
        tenantId: 'tenant-a',
        connectionId: 'conn-a',
        provider: 'crm',
        idempotencyKey: 'shared-key',
        payload: {} as any,
      });

      // Second tenant — findUnique on its (tenant-b, crm, shared-key) returns null too
      prisma.integrationEvent.findUnique.mockResolvedValueOnce(null);
      prisma.integrationEvent.create.mockResolvedValueOnce({ id: 'evt-b' });
      const outB = await service.recordEvent({
        tenantId: 'tenant-b',
        connectionId: 'conn-b',
        provider: 'crm',
        idempotencyKey: 'shared-key',
        payload: {} as any,
      });

      expect(outA).toEqual({ eventId: 'evt-a', alreadyProcessed: false });
      expect(outB).toEqual({ eventId: 'evt-b', alreadyProcessed: false });
      expect(prisma.integrationEvent.create).toHaveBeenCalledTimes(2);
      expect(crmQueue.add).toHaveBeenCalledTimes(2);
    });

    it('routes ads events to the ads queue, not crm or bot', async () => {
      prisma.integrationEvent.findUnique.mockResolvedValue(null);
      prisma.integrationEvent.create.mockResolvedValue({ id: 'evt-ads' });
      await service.recordEvent({
        tenantId: 'tenant-a',
        connectionId: 'c',
        provider: 'ads',
        idempotencyKey: 'k',
        payload: {} as any,
      });
      expect(adsQueue.add).toHaveBeenCalled();
      expect(crmQueue.add).not.toHaveBeenCalled();
      expect(botQueue.add).not.toHaveBeenCalled();
    });
  });
});
