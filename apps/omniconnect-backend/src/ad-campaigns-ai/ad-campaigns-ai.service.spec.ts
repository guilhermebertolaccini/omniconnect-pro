import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import { AdPlatform } from '@prisma/client';
import { AdCampaignsAiService } from './ad-campaigns-ai.service';
import { PrismaService } from '../prisma.service';
import { ModelPricingService } from '../model-pricing/model-pricing.service';

describe('AdCampaignsAiService', () => {
  let service: AdCampaignsAiService;
  let prisma: any;
  let config: any;
  let pricing: any;
  let queue: any;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    prisma = {
      advertiserCompany: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.id === 'ac-1' && where.tenantId === 'tenant-a') return { id: 'ac-1' };
          return null;
        }),
      },
      adCampaignAIAnalysis: {
        create: jest.fn(async ({ data }: any) => ({ id: 'analysis-1', ...data })),
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.id === 'analysis-1' && where.tenantId === 'tenant-a') {
            return { id: 'analysis-1', tenantId: 'tenant-a' };
          }
          return null;
        }),
        findMany: jest.fn(async () => []),
      },
      aIUsageLog: {
        create: jest.fn(async () => ({ id: 1 })),
      },
    };
    config = { get: jest.fn((key: string) => (key === 'OPENAI_API_KEY' ? 'sk-test' : undefined)) };
    pricing = {
      estimateCost: jest.fn(async () => ({
        cost: 0.0021,
        pricing: { currency: 'USD', inputPer1k: 0.15, outputPer1k: 0.6 },
      })),
    };
    queue = {
      add: jest.fn(async (_name, _data, opts) => ({ id: opts?.jobId ?? 'fallback' })),
      getJob: jest.fn(),
    };

    fetchSpy = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    healthScore: 73,
                    summary: 'Performance estável, com oportunidades de criativo.',
                    diagnosis: [],
                    recommendations: [],
                    anomalies: [],
                    risks: [],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 1000, completion_tokens: 200 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdCampaignsAiService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: ModelPricingService, useValue: pricing },
        { provide: getQueueToken('ad-campaigns-ai'), useValue: queue },
      ],
    }).compile();
    service = module.get(AdCampaignsAiService);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('analyze (sync)', () => {
    it('refuses when advertiser company is from another tenant', async () => {
      await expect(
        service.analyze('tenant-b', {
          advertiserCompanyId: 'ac-1',
          platform: AdPlatform.meta,
          campaignId: '123',
          campaign: {},
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses when OPENAI_API_KEY is missing', async () => {
      config.get.mockReturnValue(undefined);
      await expect(
        service.analyze('tenant-a', {
          advertiserCompanyId: 'ac-1',
          platform: AdPlatform.meta,
          campaignId: '123',
          campaign: {},
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists the analysis when persist=true (default) and writes AIUsageLog with operationType=ad_campaign_analysis', async () => {
      const out = await service.analyze('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        campaignId: 'cmp-123',
        campaign: { name: 'X' },
      } as any);
      expect(out.analysisId).toBe('analysis-1');
      expect(prisma.adCampaignAIAnalysis.create).toHaveBeenCalled();
      expect(prisma.aIUsageLog.create).toHaveBeenCalled();
      const logArg = prisma.aIUsageLog.create.mock.calls[0][0];
      expect(logArg.data.operationType).toBe('ad_campaign_analysis');
      expect(logArg.data.tenantId).toBe('tenant-a');
      expect(logArg.data.estimatedCost).toBeCloseTo(0.0021, 4);
    });

    it('skips persistence when persist=false', async () => {
      const out = await service.analyze('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        campaignId: 'cmp-123',
        campaign: { name: 'X' },
        persist: false,
      } as any);
      expect(out.analysisId).toBeNull();
      expect(prisma.adCampaignAIAnalysis.create).not.toHaveBeenCalled();
    });

    it('redacts PII deep inside campaign + insights before sending to OpenAI', async () => {
      await service.analyze('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        campaignId: 'cmp-pii',
        campaign: {
          name: 'Cliente CPF 123.456.789-01',
          description: 'Contato: 11999998888 email lead@example.com',
        },
        insights: { rows: [{ note: 'CNPJ 12.345.678/0001-90' }] },
      } as any);

      const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      const promptText = callBody.messages[1].content as string;
      expect(promptText).not.toContain('123.456.789-01');
      expect(promptText).not.toContain('12.345.678/0001-90');
      expect(promptText).not.toContain('lead@example.com');
      expect(promptText).toMatch(/\[CPF\]/);
      expect(promptText).toMatch(/\[CNPJ\]/);
      expect(promptText).toMatch(/\[EMAIL\]/);
    });

    it('writes failure AIUsageLog when OpenAI returns non-2xx', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('upstream timeout', { status: 504 }),
      );
      await expect(
        service.analyze('tenant-a', {
          advertiserCompanyId: 'ac-1',
          platform: AdPlatform.meta,
          campaignId: 'cmp-err',
          campaign: {},
        } as any),
      ).rejects.toThrow(/HTTP 504/);
      expect(prisma.aIUsageLog.create).toHaveBeenCalled();
      const logArg = prisma.aIUsageLog.create.mock.calls[0][0];
      expect(logArg.data.status).toBe('failure');
      expect(logArg.data.errorCode).toBe('504');
    });
  });

  describe('buildAnalyzeJobId', () => {
    it('is deterministic within the same hour', () => {
      const dto = {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        campaignId: 'cmp-1',
        campaign: {},
      } as any;
      expect(service.buildAnalyzeJobId('t', dto)).toBe(service.buildAnalyzeJobId('t', dto));
    });

    it('differs across tenants for the same campaign', () => {
      const dto = {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        campaignId: 'cmp-1',
        campaign: {},
      } as any;
      expect(service.buildAnalyzeJobId('a', dto)).not.toBe(service.buildAnalyzeJobId('b', dto));
    });

    it('does not leak the campaign id in the cleartext part', () => {
      const id = service.buildAnalyzeJobId('t', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        campaignId: 'SENSITIVE-123',
        campaign: {},
      } as any);
      expect(id).not.toContain('SENSITIVE-123');
      expect(id).toMatch(/^aca:[0-9a-f]{64}$/);
    });
  });

  describe('getJobStatus', () => {
    it('404s when the job does not exist', async () => {
      queue.getJob.mockResolvedValue(null);
      await expect(service.getJobStatus('tenant-a', 'aca:xyz')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s when the job belongs to another tenant', async () => {
      queue.getJob.mockResolvedValue({
        id: 'aca:xyz',
        data: { tenantId: 'tenant-b' },
        getState: async () => 'completed',
      });
      await expect(service.getJobStatus('tenant-a', 'aca:xyz')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s when the job has no tenantId in its payload (legacy)', async () => {
      queue.getJob.mockResolvedValue({
        id: 'aca:legacy',
        data: { dto: { campaignId: 'x' } },
        getState: async () => 'completed',
      });
      await expect(service.getJobStatus('tenant-a', 'aca:legacy')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns status for own tenant', async () => {
      queue.getJob.mockResolvedValue({
        id: 'aca:ok',
        data: { tenantId: 'tenant-a' },
        getState: async () => 'completed',
        returnvalue: { analysisId: 'analysis-1' },
        attemptsMade: 1,
      });
      const out = await service.getJobStatus('tenant-a', 'aca:ok');
      expect(out.status).toBe('completed');
      expect(out.result).toEqual({ analysisId: 'analysis-1' });
    });
  });

  describe('findAnalysis', () => {
    it('refuses cross-tenant read', async () => {
      await expect(service.findAnalysis('tenant-b', 'analysis-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
