import { Module } from '@nestjs/common';
import { CrmBridgeController } from './crm-bridge.controller';
import { CrmBridgeService } from './crm-bridge.service';
import { PrismaService } from '../prisma.service';
import { IntegrationEventsModule } from '../integration-events/integration-events.module';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';

@Module({
  imports: [IntegrationEventsModule, RateLimitingModule],
  controllers: [CrmBridgeController],
  providers: [CrmBridgeService, PrismaService],
  exports: [CrmBridgeService],
})
export class CrmBridgeModule {}
