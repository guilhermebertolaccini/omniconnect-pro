import { Module } from '@nestjs/common';
import { AdsBridgeController } from './ads-bridge.controller';
import { AdsBridgeService } from './ads-bridge.service';
import { PrismaService } from '../prisma.service';
import { IntegrationEventsModule } from '../integration-events/integration-events.module';

@Module({
  imports: [IntegrationEventsModule],
  controllers: [AdsBridgeController],
  providers: [AdsBridgeService, PrismaService],
  exports: [AdsBridgeService],
})
export class AdsBridgeModule {}
