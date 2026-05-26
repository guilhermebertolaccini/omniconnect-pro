import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { PrismaService } from '../prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { SystemEventsModule } from '../system-events/system-events.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET is required. Refusing to boot with a hardcoded fallback — set it in the environment.',
          );
        }
        return {
          secret,
          signOptions: {
            // Access JWT é curto por padrão — refresh token cuida da persistência
            // da sessão. Mantemos override via JWT_EXPIRES_IN para retrocompat.
            expiresIn:
              configService.get('JWT_EXPIRES_IN') ||
              configService.get('JWT_EXPIRATION') ||
              '15m',
          },
        };
      },
    }),
    SystemEventsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    PrismaService,
    RefreshTokenService,
  ],
  exports: [AuthService, RefreshTokenService],
})
export class AuthModule {}
