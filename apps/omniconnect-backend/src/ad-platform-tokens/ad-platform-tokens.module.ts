import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { SystemEventsModule } from '../system-events/system-events.module';
import { AdPlatformTokensService } from './ad-platform-tokens.service';
import {
  TOKEN_REFRESH_QUEUE,
  TokenRefreshProcessor,
} from './jobs/token-refresh.processor';
import { TokenRefreshBootstrap } from './token-refresh.bootstrap';

@Module({
  imports: [
    ConfigModule,
    SystemEventsModule,
    BullModule.registerQueue({ name: TOKEN_REFRESH_QUEUE }),
  ],
  providers: [
    PrismaService,
    BridgeSecretCipher,
    AdPlatformTokensService,
    TokenRefreshProcessor,
    TokenRefreshBootstrap,
  ],
  exports: [AdPlatformTokensService],
})
export class AdPlatformTokensModule {}
