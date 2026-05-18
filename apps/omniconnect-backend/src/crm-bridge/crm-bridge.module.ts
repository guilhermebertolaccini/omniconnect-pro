import { Module } from '@nestjs/common';
import { CrmBridgeController } from './crm-bridge.controller';
import { CrmBridgeService } from './crm-bridge.service';

import { PrismaService } from '../prisma.service';

@Module({
  controllers: [CrmBridgeController],
  providers: [CrmBridgeService, PrismaService],
  exports: [CrmBridgeService],
})
export class CrmBridgeModule {}
