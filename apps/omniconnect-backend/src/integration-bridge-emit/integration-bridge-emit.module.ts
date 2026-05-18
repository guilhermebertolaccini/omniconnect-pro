import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IntegrationEventsModule } from '../integration-events/integration-events.module';
import { IntegrationBridgeEmitController } from './integration-bridge-emit.controller';
import { IntegrationBridgeEmitService } from './integration-bridge-emit.service';

@Module({
  imports: [IntegrationEventsModule],
  controllers: [IntegrationBridgeEmitController],
  providers: [IntegrationBridgeEmitService, PrismaService],
  exports: [IntegrationBridgeEmitService],
})
export class IntegrationBridgeEmitModule {}
