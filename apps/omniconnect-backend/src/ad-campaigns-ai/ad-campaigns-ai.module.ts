import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { ModelPricingModule } from '../model-pricing/model-pricing.module';
import { AdCampaignsAiController } from './ad-campaigns-ai.controller';
import { AdCampaignsAiService } from './ad-campaigns-ai.service';
import { AnalyzeAdCampaignProcessor } from './jobs/analyze-ad-campaign.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: AdCampaignsAiService.QUEUE_NAME }),
    ModelPricingModule,
  ],
  controllers: [AdCampaignsAiController],
  providers: [PrismaService, AdCampaignsAiService, AnalyzeAdCampaignProcessor],
  exports: [AdCampaignsAiService],
})
export class AdCampaignsAiModule {}
