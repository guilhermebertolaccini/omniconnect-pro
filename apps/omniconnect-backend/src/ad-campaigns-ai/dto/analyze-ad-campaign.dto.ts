import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { AdPlatform } from '@prisma/client';

export class AnalyzeAdCampaignDto {
  @IsString()
  advertiserCompanyId!: string;

  @IsEnum(AdPlatform)
  platform!: AdPlatform;

  // External campaign id (Meta campaign_id, Google customer/campaign id,
  // TikTok campaign_id). Kept as string because provider conventions vary.
  @IsString()
  campaignId!: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

  // Raw campaign payload, opaque to the service. PII redaction is applied
  // to the JSON-stringified form before the call to the LLM.
  @IsObject()
  campaign!: Record<string, unknown>;

  // Insights/metrics blob (e.g. spend, impressions, CTR per day). Same
  // PII treatment.
  @IsOptional()
  insights?: Record<string, unknown> | unknown[];

  @IsOptional()
  @IsString()
  context?: string;

  // If false, the analysis is returned but NOT persisted to
  // AdCampaignAIAnalysis. Default true.
  @IsOptional()
  @IsBoolean()
  persist?: boolean;
}
