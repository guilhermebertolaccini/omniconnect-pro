import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import {
  TOKEN_REFRESH_JOB_NAME,
  TOKEN_REFRESH_QUEUE,
} from './jobs/token-refresh.processor';

/**
 * Registers (and reconciles) a single repeatable Bull job that periodi-
 * cally invokes the token refresh scan. The interval is configurable via
 * env (`AD_PLATFORM_TOKEN_REFRESH_INTERVAL_MS`, defaults to 1 hour) and
 * can be disabled in test/dev with `AD_PLATFORM_TOKEN_REFRESH_DISABLED=1`
 * so unit tests do not need a live Redis.
 *
 * The repeatable jobId is fixed so multiple boots of the app do not
 * accumulate duplicate schedules — each boot is idempotent.
 */
@Injectable()
export class TokenRefreshBootstrap implements OnModuleInit {
  private readonly logger = new Logger(TokenRefreshBootstrap.name);

  constructor(
    @InjectQueue(TOKEN_REFRESH_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('AD_PLATFORM_TOKEN_REFRESH_DISABLED') === '1') {
      this.logger.log('Token refresh scheduler disabled by env flag');
      return;
    }
    const everyMs = Number(
      this.config.get<string>('AD_PLATFORM_TOKEN_REFRESH_INTERVAL_MS') ?? 60 * 60 * 1000,
    );
    if (!Number.isFinite(everyMs) || everyMs <= 0) {
      this.logger.warn(`Invalid AD_PLATFORM_TOKEN_REFRESH_INTERVAL_MS; scheduler not registered`);
      return;
    }
    try {
      await this.queue.add(
        TOKEN_REFRESH_JOB_NAME,
        {},
        {
          jobId: 'ad-platform-token-refresh-cron',
          repeat: { every: everyMs },
          removeOnComplete: 20,
          removeOnFail: 20,
        },
      );
      this.logger.log(`Token refresh scheduler registered (every ${everyMs}ms)`);
    } catch (err) {
      this.logger.warn(
        `Failed to register token refresh scheduler: ${(err as Error)?.message}`,
      );
    }
  }
}
