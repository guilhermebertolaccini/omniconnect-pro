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
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET is required for crm-realtime. Refusing to boot with a hardcoded fallback — set it in the environment.',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: config.get('JWT_EXPIRES_IN') || '24h',
          },
        };
      },
    }),
  ],
  providers: [PrismaService, CrmRealtimeService, CrmGateway],
  exports: [CrmRealtimeService],
})
export class CrmRealtimeModule {}
