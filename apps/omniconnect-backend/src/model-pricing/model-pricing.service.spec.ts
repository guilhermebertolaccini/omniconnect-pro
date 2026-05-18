import { Test, TestingModule } from '@nestjs/testing';
import { ModelPricingService } from './model-pricing.service';
import { PrismaService } from '../prisma.service';

describe('ModelPricingService', () => {
  let service: ModelPricingService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      modelPricing: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelPricingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ModelPricingService>(ModelPricingService);
  });

  describe('getPrice', () => {
    it('returns DB row when present and marks source=database', async () => {
      prisma.modelPricing.findFirst.mockResolvedValue({
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        inputPer1k: 0.005,
        outputPer1k: 0.02,
        currency: 'USD',
      });

      const out = await service.getPrice('openai', 'gpt-4o');
      expect(out.inputPer1k).toBe(0.005);
      expect(out.outputPer1k).toBe(0.02);
      expect(out.source).toBe('database');
    });

    it('falls back when DB row is absent and marks source=fallback', async () => {
      prisma.modelPricing.findFirst.mockResolvedValue(null);
      const out = await service.getPrice('openai', 'gpt-4o-mini');
      expect(out.inputPer1k).toBe(0.00015);
      expect(out.outputPer1k).toBe(0.0006);
      expect(out.source).toBe('fallback');
    });

    it('falls back when DB query throws (resilient to outages)', async () => {
      prisma.modelPricing.findFirst.mockRejectedValue(new Error('db down'));
      const out = await service.getPrice('openai', 'gpt-4o');
      expect(out.source).toBe('fallback');
      // gpt-4o has a known fallback entry
      expect(out.inputPer1k).toBe(0.0025);
    });

    it('uses gpt-4o-mini baseline for unknown models', async () => {
      prisma.modelPricing.findFirst.mockResolvedValue(null);
      const out = await service.getPrice('openai', 'gpt-unknown-future');
      expect(out.inputPer1k).toBe(0.00015);
      expect(out.source).toBe('fallback');
    });

    it('falls back for anthropic default model when DB empty', async () => {
      prisma.modelPricing.findFirst.mockResolvedValue(null);
      const out = await service.getPrice('anthropic', 'claude-3-5-haiku-20241022');
      expect(out.source).toBe('fallback');
      expect(out.inputPer1k).toBe(0.0008);
      expect(out.outputPer1k).toBe(0.004);
    });

    it('caches subsequent calls for the same model on the same day', async () => {
      prisma.modelPricing.findFirst.mockResolvedValue({
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        inputPer1k: 0.005,
        outputPer1k: 0.02,
        currency: 'USD',
      });

      const at = new Date('2026-05-18T10:00:00Z');
      await service.getPrice('openai', 'gpt-4o', at);
      await service.getPrice('openai', 'gpt-4o', at);
      expect(prisma.modelPricing.findFirst).toHaveBeenCalledTimes(1);
    });

    it('clearCache forces a fresh lookup', async () => {
      prisma.modelPricing.findFirst.mockResolvedValue({
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        inputPer1k: 0.005,
        outputPer1k: 0.02,
        currency: 'USD',
      });

      const at = new Date('2026-05-18T10:00:00Z');
      await service.getPrice('openai', 'gpt-4o', at);
      service.clearCache();
      await service.getPrice('openai', 'gpt-4o', at);
      expect(prisma.modelPricing.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('estimateCost', () => {
    it('computes cost from per-1k rates and returns the pricing used', async () => {
      prisma.modelPricing.findFirst.mockResolvedValue({
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        inputPer1k: 0.005,
        outputPer1k: 0.02,
        currency: 'USD',
      });

      const out = await service.estimateCost('openai', 'gpt-4o', 1000, 500);
      // 1000/1000*0.005 + 500/1000*0.02 = 0.005 + 0.01 = 0.015
      expect(out.cost).toBeCloseTo(0.015, 6);
      expect(out.pricing.source).toBe('database');
    });

    it('returns zero cost for zero tokens', async () => {
      prisma.modelPricing.findFirst.mockResolvedValue(null);
      const out = await service.estimateCost('openai', 'gpt-4o-mini', 0, 0);
      expect(out.cost).toBe(0);
    });
  });
});
