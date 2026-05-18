import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SegmentsModule } from './segments/segments.module';
import { TabulationsModule } from './tabulations/tabulations.module';
import { ContactsModule } from './contacts/contacts.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { BlocklistModule } from './blocklist/blocklist.module';
import { LinesModule } from './lines/lines.module';
import { WhatsappCloudModule } from './whatsapp-cloud/whatsapp-cloud.module';
import { MetaBusinessModule } from './meta-business/meta-business.module';
import { ConversationsModule } from './conversations/conversations.module';
import { WebsocketModule } from './websocket/websocket.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ReportsModule } from './reports/reports.module';
import { MediaModule } from './media/media.module';
import { TagsModule } from './tags/tags.module';
import { ApiLogsModule } from './api-logs/api-logs.module';
import { ApiMessagesModule } from './api-messages/api-messages.module';
import { TemplatesModule } from './templates/templates.module';
import { ControlPanelModule } from './control-panel/control-panel.module';
import { HealthController } from './health/health.controller';
import { MessageQueueModule } from './message-queue/message-queue.module';
import { SystemEventsModule } from './system-events/system-events.module';
import { LoggerModule } from './logger/logger.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { MessageValidationModule } from './message-validation/message-validation.module';
import { MessageSendingModule } from './message-sending/message-sending.module';
import { CacheModule } from './cache/cache.module';
import { ArchivingModule } from './archiving/archiving.module';
import { AppsModule } from './apps/apps.module';
import { InsightAiModule } from './insight-ai/insight-ai.module';
import { CrmBridgeModule } from './crm-bridge/crm-bridge.module';
import { AdsBridgeModule } from './ads-bridge/ads-bridge.module';
import { BotBridgeModule } from './bot-bridge/bot-bridge.module';
import { AdPlatformConnectionsModule } from './ad-platform-connections/ad-platform-connections.module';
import { AdvertiserCompaniesModule } from './advertiser-companies/advertiser-companies.module';
import { AdCampaignsAiModule } from './ad-campaigns-ai/ad-campaigns-ai.module';
import { AdPlatformTokensModule } from './ad-platform-tokens/ad-platform-tokens.module';
import { TenantInvitationsModule } from './tenant-invitations/tenant-invitations.module';
import { OAuthModule } from './oauth/oauth.module';
import { CrmModule } from './crm/crm.module';
import { CrmSignaturesModule } from './crm-signatures/crm-signatures.module';
import { CrmStorageModule } from './crm-storage/crm-storage.module';
import { CrmPdfParserModule } from './crm-pdf-parser/crm-pdf-parser.module';
import { CrmRealtimeModule } from './crm-realtime/crm-realtime.module';
import { IntegrationBridgeEmitModule } from './integration-bridge-emit/integration-bridge-emit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule,
    CircuitBreakerModule,
    MessageValidationModule,
    MessageSendingModule,
    CacheModule,
    ArchivingModule,
    AppsModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB) : undefined,
      },
    }),
    AuthModule,
    UsersModule,
    SegmentsModule,
    TabulationsModule,
    ContactsModule,
    CampaignsModule,
    BlocklistModule,
    LinesModule,
    WhatsappCloudModule,
    MetaBusinessModule,
    ConversationsModule,
    WebsocketModule,
    WebhooksModule,
    ReportsModule,
    MediaModule,
    TagsModule,
    ApiLogsModule,
    ApiMessagesModule,
    TemplatesModule,
    ControlPanelModule,
    MessageQueueModule,
    SystemEventsModule,
    InsightAiModule,
    CrmBridgeModule,
    AdsBridgeModule,
    BotBridgeModule,
    AdPlatformConnectionsModule,
    AdvertiserCompaniesModule,
    AdCampaignsAiModule,
    AdPlatformTokensModule,
    TenantInvitationsModule,
    OAuthModule,
    CrmRealtimeModule,
    CrmModule,
    CrmSignaturesModule,
    CrmStorageModule,
    CrmPdfParserModule,
    IntegrationBridgeEmitModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule { }
