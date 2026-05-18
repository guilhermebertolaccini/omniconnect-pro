import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface ResolvedPricing {
  modelProvider: string;
  modelName: string;
  inputPer1k: number;
  outputPer1k: number;
  currency: string;
  source: 'database' | 'fallback';
}

interface CacheEntry {
  pricing: ResolvedPricing;
  cachedAt: number;
}

/**
 * Resolves the price-per-1k-tokens for a given model. Reads from the
 * `ModelPricing` table with a small in-memory TTL cache (5 minutes) so
 * we do not hit the DB on every InsightAI call. Falls back to a
 * hard-coded baseline (mirrors the previous AI_PRICING constant) when
 * the table is empty / unreachable so the hot path never breaks
 * billing.
 */
@Injectable()
export class ModelPricingService {
  private readonly logger = new Logger(ModelPricingService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  /**
   * Last-resort baseline matching the previous AI_PRICING constant.
   * Used only when the DB lookup misses (no row, no fallback by
   * provider, or query error). Keep in sync with the migration seed.
   */
  private static readonly FALLBACK: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    /** Approximate public list prices (USD per 1k tokens) — prefer DB rows from migration. */
    'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
    'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  };

  constructor(private readonly prisma: PrismaService) {}

  async getPrice(
    modelProvider: string,
    modelName: string,
    at: Date = new Date(),
  ): Promise<ResolvedPricing> {
    const cacheKey = `${modelProvider}|${modelName}|${at.getUTCFullYear()}-${at.getUTCMonth()}-${at.getUTCDate()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs) {
      return cached.pricing;
    }

    let row: any = null;
    try {
      row = await this.prisma.modelPricing.findFirst({
        where: {
          modelProvider,
          modelName,
          effectiveFrom: { lte: at },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gt: at } },
          ],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
    } catch (err) {
      this.logger.warn(`ModelPricing DB lookup failed: ${(err as Error)?.message}`);
    }

    const pricing: ResolvedPricing = row
      ? {
          modelProvider: row.modelProvider,
          modelName: row.modelName,
          inputPer1k: row.inputPer1k,
          outputPer1k: row.outputPer1k,
          currency: row.currency,
          source: 'database',
        }
      : this.fallbackFor(modelProvider, modelName);

    this.cache.set(cacheKey, { pricing, cachedAt: Date.now() });
    return pricing;
  }

  /**
   * Compute an estimated cost in the pricing currency.
   */
  async estimateCost(
    modelProvider: string,
    modelName: string,
    promptTokens: number,
    completionTokens: number,
    at: Date = new Date(),
  ): Promise<{ cost: number; pricing: ResolvedPricing }> {
    const pricing = await this.getPrice(modelProvider, modelName, at);
    const cost =
      (promptTokens / 1000) * pricing.inputPer1k +
      (completionTokens / 1000) * pricing.outputPer1k;
    return { cost, pricing };
  }

  /**
   * Invalidate the cache — useful when an admin changes pricing.
   */
  clearCache(): void {
    this.cache.clear();
  }

  private fallbackFor(modelProvider: string, modelName: string): ResolvedPricing {
    const baseline =
      ModelPricingService.FALLBACK[modelName] ||
      ModelPricingService.FALLBACK['gpt-4o-mini'];
    this.logger.warn(
      `ModelPricing fallback used for ${modelProvider}/${modelName} — populate the ModelPricing table to avoid this.`,
    );
    return {
      modelProvider,
      modelName,
      inputPer1k: baseline.input,
      outputPer1k: baseline.output,
      currency: 'USD',
      source: 'fallback',
    };
  }
}
