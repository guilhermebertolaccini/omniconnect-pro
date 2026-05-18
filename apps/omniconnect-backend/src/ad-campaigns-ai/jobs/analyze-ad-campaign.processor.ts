import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ensureJobTenant } from '../../common/utils/tenant-context';
import { AdCampaignsAiService } from '../ad-campaigns-ai.service';
import { AnalyzeAdCampaignDto } from '../dto/analyze-ad-campaign.dto';
import { PrismaService } from '../../prisma.service';
import { Prisma } from '@prisma/client';

interface AnalyzeJobData {
  tenantId: string;
  dto: AnalyzeAdCampaignDto;
  actorUserId: number | null;
}

@Processor(AdCampaignsAiService.QUEUE_NAME)
export class AnalyzeAdCampaignProcessor {
  private readonly logger = new Logger(AnalyzeAdCampaignProcessor.name);

  constructor(
    private readonly service: AdCampaignsAiService,
    private readonly prisma: PrismaService,
  ) {}

  /** @Process name must match the `queue.add('analyze', ...)` job name. */
  @Process('analyze')
  async handle(job: Job<AnalyzeJobData>): Promise<{
    analysisId: string | null;
    campaignId: string;
  }> {
    const tenantId = ensureJobTenant(job.data, `ad-campaigns-ai:${job.id}`);
    const dto = job.data.dto;
    if (!dto) {
      throw new Error('Job payload missing dto');
    }

    const analysis = await this.service.runAnalysis(tenantId, dto);

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
          generatedById: job.data.actorUserId ?? null,
        },
        select: { id: true },
      });
      analysisId = persisted.id;
    }
    this.logger.log(
      `[${tenantId}] analyzed ad campaign ${dto.campaignId} (${dto.platform})`,
    );
    return { analysisId, campaignId: dto.campaignId };
  }
}
