import { Module } from '@nestjs/common';
import { BotBridgeController } from './bot-bridge.controller';
import { BotBridgeService } from './bot-bridge.service';

@Module({
  controllers: [BotBridgeController],
  providers: [BotBridgeService],
  exports: [BotBridgeService],
})
export class BotBridgeModule {}
