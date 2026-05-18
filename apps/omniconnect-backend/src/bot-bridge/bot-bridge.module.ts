import { Module } from '@nestjs/common';
import { BotBridgeController } from './bot-bridge.controller';
import { BotBridgeService } from './bot-bridge.service';

import { PrismaService } from '../prisma.service';

@Module({
  controllers: [BotBridgeController],
  providers: [BotBridgeService, PrismaService],
  exports: [BotBridgeService],
})
export class BotBridgeModule {}
