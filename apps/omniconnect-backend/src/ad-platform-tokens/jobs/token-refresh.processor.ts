import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import {
  AdPlatformTokensService,
  TokenRefreshSummary,
} from '../ad-platform-tokens.service';

/**
 * Bull processor that drives AdPlatformTokensService.scanAndRefresh on a
 * repeatable schedule. The job payload is intentionally empty: the scan
 * spans all tenants (it is a platform-wide maintenance job, not a tenant
 * action). Per-row audit events do carry tenantId, so dashboards and
 * tenant admins still see only their own failures.
 */
export const TOKEN_REFRESH_QUEUE = 'ad-platform-tokens';
export const TOKEN_REFRESH_JOB_NAME = 'scan-and-refresh';

@Processor(TOKEN_REFRESH_QUEUE)
export class TokenRefreshProcessor {
  private readonly logger = new Logger(TokenRefreshProcessor.name);

  constructor(private readonly tokens: AdPlatformTokensService) {}

  @Process(TOKEN_REFRESH_JOB_NAME)
  async handle(_job: Job): Promise<TokenRefreshSummary> {
    const summary = await this.tokens.scanAndRefresh();
    this.logger.log(
      `Refreshed tokens: processed=${summary.processed} refreshed=${summary.refreshed} expired=${summary.expired} skipped=${summary.skipped} failed=${summary.failed}`,
    );
    return summary;
  }
}
