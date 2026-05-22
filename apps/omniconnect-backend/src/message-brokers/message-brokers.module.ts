import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { SystemEventsModule } from '../system-events/system-events.module';
import { MessageBrokersController } from './message-brokers.controller';
import { MessageBrokersService } from './message-brokers.service';

@Module({
  imports: [ConfigModule, SystemEventsModule],
  controllers: [MessageBrokersController],
  providers: [PrismaService, BridgeSecretCipher, MessageBrokersService],
  exports: [MessageBrokersService],
})
export class MessageBrokersModule {}
