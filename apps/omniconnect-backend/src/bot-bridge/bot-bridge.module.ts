import { Module } from '@nestjs/common';
import { BotBridgeController } from './bot-bridge.controller';
import { BotBridgeService } from './bot-bridge.service';
import { PrismaService } from '../prisma.service';
import { IntegrationEventsModule } from '../integration-events/integration-events.module';

@Module({
  imports: [IntegrationEventsModule],
  controllers: [BotBridgeController],
  providers: [BotBridgeService, PrismaService],
  exports: [BotBridgeService],
})
export class BotBridgeModule {}
