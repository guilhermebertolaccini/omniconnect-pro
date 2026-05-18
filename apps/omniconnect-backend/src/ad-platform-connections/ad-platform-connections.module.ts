import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { AdPlatformConnectionsController } from './ad-platform-connections.controller';
import { AdPlatformConnectionsService } from './ad-platform-connections.service';

@Module({
  imports: [ConfigModule],
  controllers: [AdPlatformConnectionsController],
  providers: [PrismaService, BridgeSecretCipher, AdPlatformConnectionsService],
  exports: [AdPlatformConnectionsService],
})
export class AdPlatformConnectionsModule {}
