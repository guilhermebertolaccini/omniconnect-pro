import { Module } from '@nestjs/common';
import { CrmBridgeController } from './crm-bridge.controller';
import { CrmBridgeService } from './crm-bridge.service';

@Module({
  controllers: [CrmBridgeController],
  providers: [CrmBridgeService],
  exports: [CrmBridgeService],
})
export class CrmBridgeModule {}
