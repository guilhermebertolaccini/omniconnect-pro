import { Module } from '@nestjs/common';
import { BotifyController } from './botify.controller';
import { BotifyInternalController } from './botify-internal.controller';
import { BotifyService } from './botify.service';
import { BotifyFlowEngineService } from './botify-flow-engine.service';
import { PrismaService } from '../prisma.service';
import { IntegrationBridgeEmitModule } from '../integration-bridge-emit/integration-bridge-emit.module';
import { IntegrationEventsModule } from '../integration-events/integration-events.module';
import { WhatsappCloudModule } from '../whatsapp-cloud/whatsapp-cloud.module';
import { BotifyOperationalHintsService } from './botify-operational-hints.service';
import { BotifyConversationsService } from './botify-conversations.service';
import { BotifyChannelConfigService } from './botify-channel-config.service';
import { BotifyRoutingService } from './botify-routing.service';
import { BotifyMetaAccountsService } from './botify-meta-accounts.service';

@Module({
  imports: [IntegrationBridgeEmitModule, IntegrationEventsModule, WhatsappCloudModule],
  controllers: [BotifyController, BotifyInternalController],
  providers: [
    BotifyService,
    BotifyConversationsService,
    BotifyFlowEngineService,
    BotifyOperationalHintsService,
    BotifyChannelConfigService,
    BotifyRoutingService,
    BotifyMetaAccountsService,
    PrismaService,
  ],
  exports: [BotifyService, BotifyConversationsService, BotifyFlowEngineService],
})
export class BotifyModule {}
