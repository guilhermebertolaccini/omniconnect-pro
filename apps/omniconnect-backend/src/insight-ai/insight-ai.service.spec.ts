import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import { InsightAiService } from './insight-ai.service';
import { PrismaService } from '../prisma.service';
import { ModelPricingService } from '../model-pricing/model-pricing.service';
import { InsightAiLlmResolver } from './providers/insight-ai-llm.resolver';

describe('InsightAiService — job lifecycle (tenant isolation + dedup)', () => {
  let service: InsightAiService;
  let queue: any;

  beforeEach(async () => {
    queue = {
      add: jest.fn().mockImplementation(async (_name, _data, opts) => ({
        id: opts?.jobId ?? 'random-id',
      })),
      getJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightAiService,
        { provide: PrismaService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: ModelPricingService, useValue: {} },
        {
          provide: InsightAiLlmResolver,
          useValue: { resolve: jest.fn().mockReturnValue(null) },
        },
        { provide: getQueueToken('insight-ai'), useValue: queue },
      ],
    }).compile();

    service = module.get(InsightAiService);
  });

  describe('buildAnalyzeJobId', () => {
    it('is deterministic for the same input within the same hour', () => {
      const a = service.buildAnalyzeJobId('tenant-a', '5511999990001', { days: 30, limit: 80 });
      const b = service.buildAnalyzeJobId('tenant-a', '5511999990001', { days: 30, limit: 80 });
      expect(a).toBe(b);
    });

    it('differs across tenants for the same phone (no leak)', () => {
      const a = service.buildAnalyzeJobId('tenant-a', '5511999990001', {});
      const b = service.buildAnalyzeJobId('tenant-b', '5511999990001', {});
      expect(a).not.toBe(b);
    });

    it('differs when the window changes', () => {
      const a = service.buildAnalyzeJobId('tenant-a', '5511999990001', { days: 30 });
      const b = service.buildAnalyzeJobId('tenant-a', '5511999990001', { days: 7 });
      expect(a).not.toBe(b);
    });

    it('does not contain the raw phone number (privacy)', () => {
      const id = service.buildAnalyzeJobId('tenant-a', '5511999990001', {});
      expect(id).not.toContain('5511999990001');
      expect(id).toMatch(/^iai:[0-9a-f]{64}$/);
    });
  });

  describe('enqueueAnalyzeByPhone', () => {
    it('passes the deterministic jobId to queue.add for dedup', async () => {
      const out = await service.enqueueAnalyzeByPhone('tenant-a', '5511999990001', { days: 30 });
      expect(queue.add).toHaveBeenCalledTimes(1);
      const opts = queue.add.mock.calls[0][2];
      expect(opts.jobId).toMatch(/^iai:[0-9a-f]{64}$/);
      expect(out.jobId).toBe(opts.jobId);
    });
  });

  describe('getJobStatus', () => {
    it('404s when the job does not exist', async () => {
      queue.getJob.mockResolvedValue(null);
      await expect(service.getJobStatus('tenant-a', 'iai:abc')).rejects.toThrow(NotFoundException);
    });

    it('404s when the job has no tenantId in its payload (strict isolation)', async () => {
      queue.getJob.mockResolvedValue({
        id: 'iai:legacy',
        data: { contactPhone: '5511999990001' },
        getState: async () => 'completed',
      });
      await expect(service.getJobStatus('tenant-a', 'iai:legacy')).rejects.toThrow(
        NotFoundException,
      );
    });

    it("404s when the job belongs to another tenant (does not leak existence)", async () => {
      queue.getJob.mockResolvedValue({
        id: 'iai:other',
        data: { tenantId: 'tenant-b', contactPhone: 'x' },
        getState: async () => 'completed',
      });
      await expect(service.getJobStatus('tenant-a', 'iai:other')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the state when the job belongs to the caller', async () => {
      queue.getJob.mockResolvedValue({
        id: 'iai:mine',
        data: { tenantId: 'tenant-a' },
        returnvalue: { ok: true },
        failedReason: null,
        attemptsMade: 1,
        getState: async () => 'completed',
      });
      const out = await service.getJobStatus('tenant-a', 'iai:mine');
      expect(out).toEqual({
        jobId: 'iai:mine',
        status: 'completed',
        result: { ok: true },
        failedReason: undefined,
        attemptsMade: 1,
      });
    });
  });
});

describe('InsightAiService — dashboard query validation', () => {
  let service: InsightAiService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      conversationAIAnalysis: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      aIUsageLog: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightAiService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: ModelPricingService, useValue: {} },
        {
          provide: InsightAiLlmResolver,
          useValue: { resolve: jest.fn().mockReturnValue(null) },
        },
        { provide: getQueueToken('insight-ai'), useValue: { add: jest.fn(), getJob: jest.fn() } },
      ],
    }).compile();

    service = module.get(InsightAiService);
  });

  it('getExecutiveSummary rejects partial date range (from without to)', async () => {
    await expect(
      service.getExecutiveSummary('tenant-x', {
        from: '2026-01-01T00:00:00.000Z',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('listAnalyses rejects partial date range (to without from)', async () => {
    await expect(
      service.listAnalyses('tenant-x', {
        to: '2026-01-02T00:00:00.000Z',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('listAnalyses calls prisma with offset/limit', async () => {
    await service.listAnalyses('tenant-x', { limit: 10, offset: 5 } as any);
    expect(prisma.conversationAIAnalysis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 10 }),
    );
  });
});
