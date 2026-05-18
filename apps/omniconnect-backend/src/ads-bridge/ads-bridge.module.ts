import { Module } from '@nestjs/common';
import { AdsBridgeController } from './ads-bridge.controller';
import { AdsBridgeService } from './ads-bridge.service';

@Module({
  controllers: [AdsBridgeController],
  providers: [AdsBridgeService],
  exports: [AdsBridgeService],
})
export class AdsBridgeModule {}
