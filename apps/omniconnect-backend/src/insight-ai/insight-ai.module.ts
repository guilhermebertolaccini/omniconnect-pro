import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from '../prisma.service';
import { InsightAiController } from './insight-ai.controller';
import { InsightAiService } from './insight-ai.service';
import { AnalyzeConversationProcessor } from './jobs/analyze-conversation.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'insight-ai',
    }),
  ],
  controllers: [InsightAiController],
  providers: [InsightAiService, PrismaService, AnalyzeConversationProcessor],
  exports: [InsightAiService],
})
export class InsightAiModule {}
