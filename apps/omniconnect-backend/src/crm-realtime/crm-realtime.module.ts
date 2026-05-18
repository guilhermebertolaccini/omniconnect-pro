import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { CrmGateway } from './crm.gateway';
import { CrmRealtimeService } from './crm-realtime.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || 'dev-jwt-secret-change-me',
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN') || '24h',
        },
      }),
    }),
  ],
  providers: [PrismaService, CrmRealtimeService, CrmGateway],
  exports: [CrmRealtimeService],
})
export class CrmRealtimeModule {}
