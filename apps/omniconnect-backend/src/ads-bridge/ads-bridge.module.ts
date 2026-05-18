import { Module } from '@nestjs/common';
import { AdsBridgeController } from './ads-bridge.controller';
import { AdsBridgeService } from './ads-bridge.service';
import { PrismaService } from '../prisma.service';
import { IntegrationEventsModule } from '../integration-events/integration-events.module';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';

@Module({
  imports: [IntegrationEventsModule, RateLimitingModule],
  controllers: [AdsBridgeController],
  providers: [AdsBridgeService, PrismaService],
  exports: [AdsBridgeService],
})
export class AdsBridgeModule {}
