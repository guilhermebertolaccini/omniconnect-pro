import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdPlatform } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';

export const TOKEN_REFRESH_FETCH = Symbol('TOKEN_REFRESH_FETCH');

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const META_BASE = 'https://graph.facebook.com/v22.0';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIKTOK_REFRESH_URL =
  'https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/';

const DEFAULT_HORIZON_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface TokenRefreshSummary {
  processed: number;
  refreshed: number;
  expired: number;
  skipped: number;
  failed: number;
}

interface ConnectionRow {
  id: string;
  tenantId: string;
  platform: AdPlatform;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  isActive: boolean;
  extra: any;
}

/**
 * Refreshes near-expiring OAuth tokens for AdPlatformConnections.
 *
 * Migrated from the Supabase `token-health-check` edge function with
 * three improvements:
 *   1. Tokens are cycled through BridgeSecretCipher (AES-256-GCM) — never
 *      stored in plaintext.
 *   2. Audit events go through SystemEventsService so they share the same
 *      tenant-scoped retention and queryability as the rest of the
 *      platform.
 *   3. Tenant isolation: every failure / success event carries tenantId.
 */
@Injectable()
export class AdPlatformTokensService {
  private readonly logger = new Logger(AdPlatformTokensService.name);
  private readonly fetchImpl: FetchFn;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cipher: BridgeSecretCipher,
    private readonly systemEvents: SystemEventsService,
    @Optional() @Inject(TOKEN_REFRESH_FETCH) injectedFetch?: FetchFn,
  ) {
    this.fetchImpl = injectedFetch ?? ((globalThis as any).fetch as FetchFn);
  }

  /**
   * Find every active connection whose token expires within `horizonMs`
   * (default 7 days) or that has already expired, and try to refresh it
   * via the appropriate provider. Returns a per-run summary.
   */
  async scanAndRefresh(horizonMs: number = DEFAULT_HORIZON_MS): Promise<TokenRefreshSummary> {
    const cutoff = new Date(Date.now() + horizonMs);
    const rows = (await this.prisma.adPlatformConnection.findMany({
      where: {
        tokenExpiresAt: { lte: cutoff, not: null },
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        platform: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        tokenExpiresAt: true,
        isActive: true,
        extra: true,
      },
    })) as ConnectionRow[];

    const summary: TokenRefreshSummary = {
      processed: 0,
      refreshed: 0,
      expired: 0,
      skipped: 0,
      failed: 0,
    };
    const now = Date.now();

    for (const row of rows) {
      summary.processed++;
      const expiresMs = row.tokenExpiresAt
        ? new Date(row.tokenExpiresAt).getTime()
        : 0;
      const alreadyExpired = expiresMs < now;

      if (alreadyExpired && !row.refreshTokenEncrypted && row.platform !== AdPlatform.meta) {
        await this.markExpired(row);
        summary.expired++;
        continue;
      }

      try {
        const ok =
          row.platform === AdPlatform.meta
            ? await this.refreshMeta(row)
            : row.platform === AdPlatform.google_ads
              ? await this.refreshGoogle(row)
              : row.platform === AdPlatform.tiktok_ads
                ? await this.refreshTikTok(row)
                : false;
        if (ok) {
          summary.refreshed++;
        } else {
          summary.skipped++;
        }
      } catch (err) {
        summary.failed++;
        await this.auditFailure(row, (err as Error)?.message ?? 'unknown');
      }
    }
    return summary;
  }

  // ----- providers ----------------------------------------------------

  private async refreshMeta(row: ConnectionRow): Promise<boolean> {
    const appId = this.config.get<string>('META_APP_ID');
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appId || !appSecret) {
      this.logger.warn(`Meta refresh skipped for ${row.id} — META_APP_ID/SECRET missing`);
      return false;
    }
    if (!row.accessTokenEncrypted) return false;
    const token = this.cipher.decryptWithLegacyFallback(row.accessTokenEncrypted);
    const url =
      `${META_BASE}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(token)}`;
    const res = await this.fetchImpl(url);
    const data = (await this.safeJson(res)) as { access_token?: string; expires_in?: number; error?: unknown };
    if (!res.ok || !data?.access_token) {
      throw new Error(`meta refresh HTTP ${res.status}`);
    }
    const newExpires = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    await this.prisma.adPlatformConnection.update({
      where: { id: row.id },
      data: {
        accessTokenEncrypted: this.cipher.encrypt(data.access_token),
        tokenExpiresAt: newExpires,
        isActive: true,
      },
    });
    await this.auditSuccess(row, row.tokenExpiresAt, newExpires);
    return true;
  }

  private async refreshGoogle(row: ConnectionRow): Promise<boolean> {
    if (!row.refreshTokenEncrypted) return false;
    const clientId = this.config.get<string>('GOOGLE_ADS_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_ADS_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      this.logger.warn(`Google refresh skipped for ${row.id} — client id/secret missing`);
      return false;
    }
    const refreshToken = this.cipher.decryptWithLegacyFallback(row.refreshTokenEncrypted);
    const res = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = (await this.safeJson(res)) as { access_token?: string; expires_in?: number };
    if (!res.ok || !data?.access_token) {
      throw new Error(`google refresh HTTP ${res.status}`);
    }
    const newExpires = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
    await this.prisma.adPlatformConnection.update({
      where: { id: row.id },
      data: {
        accessTokenEncrypted: this.cipher.encrypt(data.access_token),
        tokenExpiresAt: newExpires,
        isActive: true,
      },
    });
    await this.auditSuccess(row, row.tokenExpiresAt, newExpires);
    return true;
  }

  private async refreshTikTok(row: ConnectionRow): Promise<boolean> {
    if (!row.refreshTokenEncrypted) return false;
    const appId = this.config.get<string>('TIKTOK_APP_ID');
    const secret = this.config.get<string>('TIKTOK_APP_SECRET');
    if (!appId || !secret) {
      this.logger.warn(`TikTok refresh skipped for ${row.id} — TIKTOK_APP_ID/SECRET missing`);
      return false;
    }
    const refreshToken = this.cipher.decryptWithLegacyFallback(row.refreshTokenEncrypted);
    const res = await this.fetchImpl(TIKTOK_REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, secret, refresh_token: refreshToken }),
    });
    const data = (await this.safeJson(res)) as {
      code?: number;
      data?: { access_token?: string; refresh_token?: string; access_token_expire_in?: number };
    };
    if (data?.code !== 0 || !data?.data?.access_token) {
      throw new Error(`tiktok refresh code ${data?.code ?? 'unknown'}`);
    }
    const newExpires = data.data.access_token_expire_in
      ? new Date(Date.now() + data.data.access_token_expire_in * 1000)
      : null;
    await this.prisma.adPlatformConnection.update({
      where: { id: row.id },
      data: {
        accessTokenEncrypted: this.cipher.encrypt(data.data.access_token),
        refreshTokenEncrypted: this.cipher.encrypt(data.data.refresh_token ?? refreshToken),
        tokenExpiresAt: newExpires,
        isActive: true,
      },
    });
    await this.auditSuccess(row, row.tokenExpiresAt, newExpires);
    return true;
  }

  // ----- audit helpers ------------------------------------------------

  private async auditSuccess(row: ConnectionRow, oldExp: Date | null, newExp: Date | null) {
    await this.systemEvents
      .logEvent(
        EventType.AD_PLATFORM_TOKEN_REFRESHED,
        EventModule.AD_PLATFORM_TOKEN_REFRESH,
        {
          connectionId: row.id,
          platform: row.platform,
          oldExpiresAt: oldExp,
          newExpiresAt: newExp,
        },
        null,
        EventSeverity.INFO,
        row.tenantId,
      )
      .catch((err) => this.logger.warn(`audit success failed: ${(err as Error).message}`));
  }

  private async auditFailure(row: ConnectionRow, message: string) {
    await this.systemEvents
      .logEvent(
        EventType.AD_PLATFORM_TOKEN_REFRESH_FAILED,
        EventModule.AD_PLATFORM_TOKEN_REFRESH,
        {
          connectionId: row.id,
          platform: row.platform,
          error: message,
        },
        null,
        EventSeverity.ERROR,
        row.tenantId,
      )
      .catch((err) => this.logger.warn(`audit failure failed: ${(err as Error).message}`));
  }

  private async markExpired(row: ConnectionRow) {
    await this.prisma.adPlatformConnection.update({
      where: { id: row.id },
      data: { isActive: false },
    });
    await this.systemEvents
      .logEvent(
        EventType.AD_PLATFORM_TOKEN_EXPIRED,
        EventModule.AD_PLATFORM_TOKEN_REFRESH,
        {
          connectionId: row.id,
          platform: row.platform,
          expiresAt: row.tokenExpiresAt,
        },
        null,
        EventSeverity.WARNING,
        row.tenantId,
      )
      .catch((err) => this.logger.warn(`audit expired failed: ${(err as Error).message}`));
  }

  private async safeJson(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
}
