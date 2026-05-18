import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from '../prisma.service';
import { IntegrationEventsService } from './integration-events.service';
import { CrmEventProcessor } from './jobs/crm-event.processor';
import { AdsEventProcessor } from './jobs/ads-event.processor';
import { BotEventProcessor } from './jobs/bot-event.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'crm-events' },
      { name: 'ads-events' },
      { name: 'bot-events' },
    ),
  ],
  providers: [
    PrismaService,
    IntegrationEventsService,
    CrmEventProcessor,
    AdsEventProcessor,
    BotEventProcessor,
  ],
  exports: [IntegrationEventsService],
})
export class IntegrationEventsModule {}
