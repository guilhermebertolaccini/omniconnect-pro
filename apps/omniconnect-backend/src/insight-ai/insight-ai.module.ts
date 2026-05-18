import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from '../prisma.service';
import { InsightAiController } from './insight-ai.controller';
import { InsightAiService } from './insight-ai.service';
import { AnalyzeConversationProcessor } from './jobs/analyze-conversation.processor';
import { ModelPricingModule } from '../model-pricing/model-pricing.module';
import { OpenAiInsightProvider } from './providers/openai-insight.provider';
import { AnthropicInsightProvider } from './providers/anthropic-insight.provider';
import { GeminiInsightProvider } from './providers/gemini-insight.provider';
import { InsightAiLlmResolver } from './providers/insight-ai-llm.resolver';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'insight-ai',
    }),
    ModelPricingModule,
  ],
  controllers: [InsightAiController],
  providers: [
    InsightAiService,
    OpenAiInsightProvider,
    AnthropicInsightProvider,
    GeminiInsightProvider,
    InsightAiLlmResolver,
    PrismaService,
    AnalyzeConversationProcessor,
  ],
  exports: [InsightAiService],
})
export class InsightAiModule {}
