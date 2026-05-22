import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LineReputationService } from '../line-reputation/line-reputation.service';
import { SystemEventsModule } from '../system-events/system-events.module';
import { LineHealthController } from './line-health.controller';
import { LineHealthService } from './line-health.service';

@Module({
  imports: [SystemEventsModule],
  controllers: [LineHealthController],
  providers: [PrismaService, LineReputationService, LineHealthService],
  exports: [LineHealthService],
})
export class LineHealthModule {}
