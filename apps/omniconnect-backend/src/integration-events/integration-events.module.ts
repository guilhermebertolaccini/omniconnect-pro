import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from '../prisma.service';
import { IntegrationEventsService } from './integration-events.service';
import { BridgeSecretCipher } from './bridge-secret-cipher';
import { CrmEventProcessor } from './jobs/crm-event.processor';
import { AdsEventProcessor } from './jobs/ads-event.processor';
import { BotEventProcessor } from './jobs/bot-event.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue(
      { name: 'crm-events' },
      { name: 'ads-events' },
      { name: 'bot-events' },
    ),
  ],
  providers: [
    PrismaService,
    IntegrationEventsService,
    BridgeSecretCipher,
    CrmEventProcessor,
    AdsEventProcessor,
    BotEventProcessor,
  ],
  exports: [IntegrationEventsService, BridgeSecretCipher],
})
export class IntegrationEventsModule {}
