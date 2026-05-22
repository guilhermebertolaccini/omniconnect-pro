import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SystemEventsModule } from '../system-events/system-events.module';
import { TenantWalletsController } from './tenant-wallets.controller';
import { TenantWalletsService } from './tenant-wallets.service';

@Module({
  imports: [SystemEventsModule],
  controllers: [TenantWalletsController],
  providers: [PrismaService, TenantWalletsService],
  exports: [TenantWalletsService],
})
export class TenantWalletsModule {}
