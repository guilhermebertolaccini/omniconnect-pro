import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';
import { AdPlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ModelPricingService } from '../model-pricing/model-pricing.service';
import { redactPII } from '../insight-ai/pii-redactor.util';
import {
  buildAdCampaignAnalysisPrompt,
  PROMPT_VERSION,
} from './ad-campaigns-ai.prompt';
import { AnalyzeAdCampaignDto } from './dto/analyze-ad-campaign.dto';

export interface AnalyzeAdCampaignResult {
  campaignId: string;
  platform: AdPlatform;
  analysisId: string | null;
  analysis: Record<string, unknown>;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
}

export interface EnqueueAdCampaignResult {
  jobId: string;
  tenantId: string;
  campaignId: string;
  status: 'queued';
}

export interface AdCampaignJobStatus {
  jobId: string;
  status:
    | 'queued'
    | 'active'
    | 'completed'
    | 'failed'
    | 'delayed'
    | 'waiting'
    | 'paused'
    | 'stuck'
    | 'unknown';
  result?: unknown;
  failedReason?: string;
  attemptsMade?: number;
}

@Injectable()
export class AdCampaignsAiService {
  private readonly logger = new Logger(AdCampaignsAiService.name);
  static readonly QUEUE_NAME = 'ad-campaigns-ai';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly pricing: ModelPricingService,
    @InjectQueue(AdCampaignsAiService.QUEUE_NAME) private readonly queue: Queue,
  ) {}

  /** Synchronous analysis — runs the LLM call inline and returns the result. */
  async analyze(
    tenantId: string,
    dto: AnalyzeAdCampaignDto,
    actorUserId?: number,
  ): Promise<AnalyzeAdCampaignResult> {
    await this.assertAdvertiserCompany(tenantId, dto.advertiserCompanyId);

    const analysis = await this.runAnalysis(tenantId, dto);

    let analysisId: string | null = null;
    if (dto.persist !== false) {
      const persisted = await this.prisma.adCampaignAIAnalysis.create({
        data: {
          tenantId,
          advertiserCompanyId: dto.advertiserCompanyId,
          platform: dto.platform,
          campaignId: dto.campaignId,
          campaignName: dto.campaignName ?? null,
          analysis: analysis.result as Prisma.InputJsonValue,
          modelProvider: analysis.modelProvider,
          modelName: analysis.modelName,
          promptVersion: analysis.promptVersion,
          generatedById: actorUserId ?? null,
        },
        select: { id: true },
      });
      analysisId = persisted.id;
    }

    return {
      campaignId: dto.campaignId,
      platform: dto.platform,
      analysisId,
      analysis: analysis.result,
      modelProvider: analysis.modelProvider,
      modelName: analysis.modelName,
      promptVersion: analysis.promptVersion,
    };
  }

  /** Enqueue an async job. Job id is deterministic (sha256 of payload + hour bucket). */
  async enqueueAnalyze(
    tenantId: string,
    dto: AnalyzeAdCampaignDto,
    actorUserId?: number,
  ): Promise<EnqueueAdCampaignResult> {
    await this.assertAdvertiserCompany(tenantId, dto.advertiserCompanyId);

    const jobId = this.buildAnalyzeJobId(tenantId, dto);
    await this.queue.add(
      'analyze',
      { tenantId, dto, actorUserId: actorUserId ?? null },
      {
        jobId,
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
    return {
      jobId,
      tenantId,
      campaignId: dto.campaignId,
      status: 'queued',
    };
  }

  /** Status of a previously-enqueued job. Strict tenant scoping: jobs without
   * `tenantId` in payload — or with a different tenantId — return 404. */
  async getJobStatus(tenantId: string, jobId: string): Promise<AdCampaignJobStatus> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    const payloadTenant = (job.data as { tenantId?: string } | null | undefined)?.tenantId;
    if (!payloadTenant || payloadTenant !== tenantId) {
      throw new NotFoundException('Job not found');
    }
    const state = await job.getState();
    return {
      jobId: String(job.id),
      status: (state ?? 'unknown') as AdCampaignJobStatus['status'],
      result: job.returnvalue ?? undefined,
      failedReason: job.failedReason ?? undefined,
      attemptsMade: job.attemptsMade,
    };
  }

  buildAnalyzeJobId(tenantId: string, dto: AnalyzeAdCampaignDto): string {
    const bucket = Math.floor(Date.now() / (60 * 60 * 1000));
    const material = [
      tenantId,
      dto.advertiserCompanyId,
      dto.platform,
      dto.campaignId,
      dto.campaignName ?? '',
      bucket,
    ].join('|');
    const digest = crypto.createHash('sha256').update(material).digest('hex');
    return `aca:${digest}`;
  }

  /** Used by both sync and async (processor) entry points. */
  async runAnalysis(
    tenantId: string,
    dto: AnalyzeAdCampaignDto,
  ): Promise<{
    result: Record<string, unknown>;
    modelProvider: string;
    modelName: string;
    promptVersion: string;
  }> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException(
        'OPENAI_API_KEY is not configured — cannot run AI analysis.',
      );
    }

    const safeCampaign = this.redactDeep(dto.campaign) as Record<string, unknown>;
    const safeInsights = this.redactDeep(dto.insights ?? null) as
      | Record<string, unknown>
      | unknown[]
      | null;
    const prompt = buildAdCampaignAnalysisPrompt({
      platform: dto.platform,
      campaign: safeCampaign,
      insights: safeInsights,
      context: dto.context,
    });

    const model = this.config.get<string>('OPENAI_AD_CAMPAIGN_MODEL') ?? 'gpt-4o-mini';
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Você é um analista sênior de mídia paga. Responda somente JSON válido. Nunca inclua dados pessoais nos campos de resposta.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        const err = new Error(`OpenAI HTTP ${response.status}: ${body.slice(0, 500)}`);
        await this.logUsageFailure(tenantId, model, err);
        throw err;
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        const err = new Error('OpenAI returned empty content.');
        await this.logUsageFailure(tenantId, model, err);
        throw err;
      }
      const promptTokens = data.usage?.prompt_tokens ?? 0;
      const completionTokens = data.usage?.completion_tokens ?? 0;
      const { cost: estimatedCost, pricing } = await this.pricing.estimateCost(
        'openai',
        model,
        promptTokens,
        completionTokens,
      );
      await this.logUsageSuccess(tenantId, model, promptTokens, completionTokens, estimatedCost, pricing.currency);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = { raw: content };
      }
      return {
        result: parsed,
        modelProvider: 'openai',
        modelName: model,
        promptVersion: PROMPT_VERSION,
      };
    } catch (err) {
      this.logger.warn(`OpenAI call failed: ${(err as Error)?.message ?? err}`);
      throw err;
    }
  }

  // ----- helpers -------------------------------------------------------

  private async assertAdvertiserCompany(tenantId: string, advertiserCompanyId: string) {
    const ac = await this.prisma.advertiserCompany.findFirst({
      where: { id: advertiserCompanyId, tenantId },
      select: { id: true },
    });
    if (!ac) {
      throw new NotFoundException('Advertiser company not found for this tenant');
    }
  }

  /**
   * Recursively walks a value applying redactPII to every string. Numbers,
   * booleans, nulls and dates pass through unchanged. Arrays and plain
   * objects are mapped depth-first.
   */
  private redactDeep(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return redactPII(value);
    if (Array.isArray(value)) return value.map((v) => this.redactDeep(v));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.redactDeep(v);
      }
      return out;
    }
    return value;
  }

  private async logUsageSuccess(
    tenantId: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    cost: number,
    currency: string,
  ) {
    try {
      await this.prisma.aIUsageLog.create({
        data: {
          tenantId,
          operationType: 'ad_campaign_analysis',
          modelProvider: 'openai',
          modelName: model,
          promptVersion: PROMPT_VERSION,
          promptTokens,
          completionTokens,
          estimatedCost: cost,
          currency,
          status: 'success',
        },
      });
    } catch (err) {
      this.logger.error(`Failed to save AIUsageLog: ${(err as Error)?.message}`);
    }
  }

  private async logUsageFailure(tenantId: string, model: string, error: Error) {
    const errorCode = /HTTP (\d+)/i.exec(error?.message ?? '')?.[1] ?? 'unknown';
    await this.prisma.aIUsageLog
      .create({
        data: {
          tenantId,
          operationType: 'ad_campaign_analysis',
          modelProvider: 'openai',
          modelName: model,
          promptVersion: PROMPT_VERSION,
          promptTokens: 0,
          completionTokens: 0,
          estimatedCost: 0,
          currency: 'USD',
          status: 'failure',
          errorCode,
          errorMessage: (error?.message ?? 'unknown').slice(0, 1000),
        },
      })
      .catch((err) =>
        this.logger.error(`Failed to save AIUsageLog failure: ${(err as Error)?.message}`),
      );
  }

  // ----- queries -------------------------------------------------------

  async findAnalyses(
    tenantId: string,
    filters: {
      advertiserCompanyId?: string;
      platform?: AdPlatform;
      campaignId?: string;
      limit?: number;
    },
  ) {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    return this.prisma.adCampaignAIAnalysis.findMany({
      where: {
        tenantId,
        ...(filters.advertiserCompanyId ? { advertiserCompanyId: filters.advertiserCompanyId } : {}),
        ...(filters.platform ? { platform: filters.platform } : {}),
        ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findAnalysis(tenantId: string, id: string) {
    const record = await this.prisma.adCampaignAIAnalysis.findFirst({
      where: { id, tenantId },
    });
    if (!record) {
      throw new NotFoundException('Ad campaign analysis not found for this tenant');
    }
    return record;
  }
}
