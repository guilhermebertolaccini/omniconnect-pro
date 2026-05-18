import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TenantApiKeysService } from './tenant-api-keys.service';

@Module({
  providers: [PrismaService, TenantApiKeysService],
  exports: [TenantApiKeysService],
})
export class TenantApiKeysModule {}
