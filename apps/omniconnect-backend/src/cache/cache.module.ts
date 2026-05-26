import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { LoggerModule } from '../logger/logger.module';
import { redisStore } from 'cache-manager-redis-yet';
import { getRedisConnectionOptions } from '../common/config/redis-options';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redis = getRedisConnectionOptions({
          REDIS_URL: configService.get('REDIS_URL'),
          REDIS_HOST: configService.get('REDIS_HOST'),
          REDIS_PORT: configService.get('REDIS_PORT'),
          REDIS_USERNAME: configService.get('REDIS_USERNAME'),
          REDIS_PASSWORD: configService.get('REDIS_PASSWORD'),
          REDIS_DB: configService.get('REDIS_DB'),
        });

        return {
          store: redisStore,
          host: redis.host,
          port: redis.port,
          password: redis.password,
          username: redis.username,
          db: redis.db ?? 0,
          ttl: 300, // TTL padrão: 5 minutos
          max: 1000, // Máximo de itens no cache
        };
      },
    }),
    LoggerModule,
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
