import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SystemEventsModule } from '../system-events/system-events.module';
import { AntiFatigueController } from './anti-fatigue.controller';
import { AntiFatigueService } from './anti-fatigue.service';

@Module({
  imports: [SystemEventsModule],
  controllers: [AntiFatigueController],
  providers: [PrismaService, AntiFatigueService],
  exports: [AntiFatigueService],
})
export class AntiFatigueModule {}
