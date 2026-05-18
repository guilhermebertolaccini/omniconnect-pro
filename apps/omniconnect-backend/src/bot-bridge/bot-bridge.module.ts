import { Module } from '@nestjs/common';
import { BotBridgeController } from './bot-bridge.controller';
import { BotBridgeService } from './bot-bridge.service';
import { PrismaService } from '../prisma.service';
import { IntegrationEventsModule } from '../integration-events/integration-events.module';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';

@Module({
  imports: [IntegrationEventsModule, RateLimitingModule],
  controllers: [BotBridgeController],
  providers: [BotBridgeService, PrismaService],
  exports: [BotBridgeService],
})
export class BotBridgeModule {}
