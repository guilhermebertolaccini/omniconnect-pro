import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { SystemEventsModule } from '../system-events/system-events.module';
import { OAuthService } from './oauth.service';
import { OAuthController } from './oauth.controller';

@Module({
  imports: [ConfigModule, SystemEventsModule],
  controllers: [OAuthController],
  providers: [PrismaService, BridgeSecretCipher, OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
