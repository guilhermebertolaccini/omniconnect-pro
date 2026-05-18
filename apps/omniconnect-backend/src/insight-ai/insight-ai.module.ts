import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { InsightAiController } from './insight-ai.controller';
import { InsightAiService } from './insight-ai.service';

@Module({
  imports: [ConfigModule],
  controllers: [InsightAiController],
  providers: [InsightAiService, PrismaService],
  exports: [InsightAiService],
})
export class InsightAiModule {}
