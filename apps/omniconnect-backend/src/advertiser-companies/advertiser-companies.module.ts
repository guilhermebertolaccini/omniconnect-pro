import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { AdPlatformConnectionsModule } from '../ad-platform-connections/ad-platform-connections.module';
import { AdPlatformConnectionsService } from '../ad-platform-connections/ad-platform-connections.service';
import { SystemEventsModule } from '../system-events/system-events.module';
import { AdvertiserCompaniesController } from './advertiser-companies.controller';
import { AdvertiserCompaniesService } from './advertiser-companies.service';
import { AdPlatformProxyService } from './ad-platform-proxy.service';

@Module({
  imports: [ConfigModule, AdPlatformConnectionsModule, SystemEventsModule],
  controllers: [AdvertiserCompaniesController],
  providers: [
    PrismaService,
    BridgeSecretCipher,
    AdPlatformConnectionsService,
    AdvertiserCompaniesService,
    AdPlatformProxyService,
  ],
  exports: [AdvertiserCompaniesService, AdPlatformProxyService],
})
export class AdvertiserCompaniesModule {}
