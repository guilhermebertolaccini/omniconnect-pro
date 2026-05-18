import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { SystemEventsModule } from '../system-events/system-events.module';
import { TenantInvitationsService } from './tenant-invitations.service';
import { TenantInvitationsController } from './tenant-invitations.controller';

@Module({
  imports: [ConfigModule, SystemEventsModule],
  controllers: [TenantInvitationsController],
  providers: [TenantInvitationsService, PrismaService],
  exports: [TenantInvitationsService],
})
export class TenantInvitationsModule {}
