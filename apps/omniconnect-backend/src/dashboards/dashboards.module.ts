import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({
  controllers: [DashboardsController],
  providers: [DashboardsService, PrismaService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
