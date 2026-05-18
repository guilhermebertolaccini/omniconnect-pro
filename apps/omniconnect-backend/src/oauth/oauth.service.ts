import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AdPlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';

export const OAUTH_FETCH = Symbol('OAUTH_FETCH');
type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

interface StatePayload {
  tid: string; // tenantId
  uid: number; // userId
  aci: string; // advertiserCompanyId
  plat: AdPlatform;
  n: string; // nonce
  exp: number; // ms epoch
  ru?: string; // optional return path (frontend route to bounce back to)
}

interface CodeExchangeResult {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  accountId?: string | null;
  extra?: Record<string, unknown> | null;
}

interface ProviderSpec {
  authorizeUrl: (params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scope: string;
  }) => string;
  scope: string;
  exchange: (params: {
    code: string;
    redirectUri: string;
    config: ConfigService;
    fetchImpl: FetchFn;
  }) => Promise<CodeExchangeResult>;
}

const META_BASE = 'https://graph.facebook.com/v22.0';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly fetchImpl: FetchFn;

  static readonly STATE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cipher: BridgeSecretCipher,
    private readonly systemEvents: SystemEventsService,
    @Optional() @Inject(OAUTH_FETCH) injectedFetch?: FetchFn,
  ) {
    this.fetchImpl = injectedFetch ?? ((globalThis as any).fetch as FetchFn);
  }

  // ---------------------------------------------------------------------------
  // /oauth/:platform/start
  // ---------------------------------------------------------------------------

  async buildAuthorizeUrl(input: {
    tenantId: string;
    userId: number;
    advertiserCompanyId: string;
    platform: AdPlatform;
    returnUrl?: string | null;
  }): Promise<{ authorizeUrl: string; state: string; expiresAt: Date }> {
    if (!input.tenantId) throw new BadRequestException('tenantId required');

    const company = await this.prisma.advertiserCompany.findFirst({
      where: { id: input.advertiserCompanyId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Advertiser company not found');

    const provider = this.providerFor(input.platform);
    const clientId = this.requireConfig(this.clientIdEnv(input.platform));
    const redirectUri = this.buildRedirectUri(input.platform);

    const expiresAt = new Date(Date.now() + OAuthService.STATE_TTL_MS);
    const payload: StatePayload = {
      tid: input.tenantId,
      uid: input.userId,
      aci: input.advertiserCompanyId,
      plat: input.platform,
      n: randomBytes(16).toString('hex'),
      exp: expiresAt.getTime(),
      ru: input.returnUrl ?? undefined,
    };
    const state = this.encodeState(payload);

    const authorizeUrl = provider.authorizeUrl({
      clientId,
      redirectUri,
      state,
      scope: provider.scope,
    });

    void this.audit(
      input.tenantId,
      input.userId,
      EventType.AD_PLATFORM_OAUTH_STARTED,
      EventSeverity.INFO,
      {
        platform: input.platform,
        advertiserCompanyId: input.advertiserCompanyId,
        expiresAt: expiresAt.toISOString(),
      },
    );

    return { authorizeUrl, state, expiresAt };
  }

  // ---------------------------------------------------------------------------
  // /oauth/:platform/callback
  // ---------------------------------------------------------------------------

  async handleCallback(input: {
    platform: AdPlatform;
    code: string;
    state: string;
    actingUserId: number | null;
  }): Promise<{
    connectionId: string;
    advertiserCompanyId: string;
    tenantId: string;
    returnUrl: string | null;
  }> {
    if (!input.code) throw new BadRequestException('code required');
    if (!input.state) throw new BadRequestException('state required');

    const payload = this.decodeState(input.state);

    if (payload.plat !== input.platform) {
      void this.audit(
        payload.tid,
        payload.uid,
        EventType.AD_PLATFORM_OAUTH_FAILED,
        EventSeverity.ERROR,
        {
          platform: payload.plat,
          advertiserCompanyId: payload.aci,
          error: 'platform_state_mismatch',
        },
      );
      throw new BadRequestException('platform/state mismatch');
    }
    if (payload.exp < Date.now()) {
      void this.audit(
        payload.tid,
        payload.uid,
        EventType.AD_PLATFORM_OAUTH_FAILED,
        EventSeverity.ERROR,
        {
          platform: payload.plat,
          advertiserCompanyId: payload.aci,
          error: 'state_expired',
        },
      );
      throw new BadRequestException('state expired');
    }

    const company = await this.prisma.advertiserCompany.findFirst({
      where: { id: payload.aci, tenantId: payload.tid },
      select: { id: true },
    });
    if (!company) {
      void this.audit(
        payload.tid,
        payload.uid,
        EventType.AD_PLATFORM_OAUTH_FAILED,
        EventSeverity.ERROR,
        {
          platform: payload.plat,
          advertiserCompanyId: payload.aci,
          error: 'company_missing',
        },
      );
      throw new NotFoundException('Advertiser company no longer exists');
    }

    try {
      const provider = this.providerFor(payload.plat);
      const redirectUri = this.buildRedirectUri(payload.plat);
      const exchanged = await provider.exchange({
        code: input.code,
        redirectUri,
        config: this.config,
        fetchImpl: this.fetchImpl,
      });

      const accessTokenEncrypted = this.cipher.encrypt(exchanged.accessToken);
      const refreshTokenEncrypted = exchanged.refreshToken
        ? this.cipher.encrypt(exchanged.refreshToken)
        : null;

      const existing = await this.prisma.adPlatformConnection.findUnique({
        where: {
          advertiserCompanyId_platform: {
            advertiserCompanyId: payload.aci,
            platform: payload.plat,
          },
        },
        select: { id: true, extra: true },
      });

      let connectionId: string;
      const extra = {
        ...((existing?.extra as Prisma.JsonObject | null) ?? {}),
        ...(exchanged.extra ?? {}),
      };

      if (existing) {
        await this.prisma.adPlatformConnection.update({
          where: { id: existing.id },
          data: {
            accessTokenEncrypted,
            refreshTokenEncrypted: refreshTokenEncrypted ?? null,
            tokenExpiresAt: exchanged.expiresAt ?? null,
            accountId: exchanged.accountId ?? null,
            isActive: true,
            extra: extra as Prisma.InputJsonValue,
          },
        });
        connectionId = existing.id;
      } else {
        const created = await this.prisma.adPlatformConnection.create({
          data: {
            tenantId: payload.tid,
            advertiserCompanyId: payload.aci,
            platform: payload.plat,
            accessTokenEncrypted,
            refreshTokenEncrypted: refreshTokenEncrypted ?? null,
            tokenExpiresAt: exchanged.expiresAt ?? null,
            accountId: exchanged.accountId ?? null,
            isActive: true,
            extra: extra as Prisma.InputJsonValue,
            createdById: input.actingUserId ?? payload.uid,
          },
          select: { id: true },
        });
        connectionId = created.id;
      }

      void this.audit(
        payload.tid,
        payload.uid,
        EventType.AD_PLATFORM_OAUTH_COMPLETED,
        EventSeverity.SUCCESS,
        {
          platform: payload.plat,
          advertiserCompanyId: payload.aci,
          connectionId,
          rotated: existing !== null,
        },
      );

      return {
        connectionId,
        advertiserCompanyId: payload.aci,
        tenantId: payload.tid,
        returnUrl: payload.ru ?? null,
      };
    } catch (err) {
      void this.audit(
        payload.tid,
        payload.uid,
        EventType.AD_PLATFORM_OAUTH_FAILED,
        EventSeverity.ERROR,
        {
          platform: payload.plat,
          advertiserCompanyId: payload.aci,
          error: (err as Error).message?.slice(0, 200) ?? 'unknown',
        },
      );
      throw err;
    }
  }

  buildFrontendBounceUrl(
    platform: AdPlatform,
    result: { status: 'success' | 'error'; connectionId?: string; returnUrl?: string | null; error?: string },
  ): string {
    const base = this.config.get<string>('OAUTH_FRONTEND_REDIRECT_BASE') ||
      this.config.get<string>('FRONTEND_URL') ||
      'http://localhost:5173';
    const target = result.returnUrl?.startsWith('/') ? `${base}${result.returnUrl}` : base;
    const url = new URL(target);
    url.searchParams.set('platform', platform);
    url.searchParams.set('status', result.status);
    if (result.connectionId) url.searchParams.set('connectionId', result.connectionId);
    if (result.error) url.searchParams.set('error', result.error.slice(0, 120));
    return url.toString();
  }

  // ---------------------------------------------------------------------------
  // State codec
  // ---------------------------------------------------------------------------

  private encodeState(payload: StatePayload): string {
    const json = JSON.stringify(payload);
    const cipher = this.cipher.encrypt(json);
    return Buffer.from(cipher, 'utf8').toString('base64url');
  }

  private decodeState(state: string): StatePayload {
    let raw: string;
    try {
      raw = Buffer.from(state, 'base64url').toString('utf8');
    } catch {
      throw new BadRequestException('invalid state');
    }
    let decoded: string;
    try {
      decoded = this.cipher.decryptWithLegacyFallback(raw);
    } catch {
      throw new BadRequestException('invalid state');
    }
    try {
      const payload = JSON.parse(decoded) as StatePayload;
      if (!payload?.tid || !payload?.aci || !payload?.plat || !payload?.n) {
        throw new Error('missing fields');
      }
      return payload;
    } catch {
      throw new BadRequestException('invalid state');
    }
  }

  // ---------------------------------------------------------------------------
  // Provider registry
  // ---------------------------------------------------------------------------

  private providerFor(platform: AdPlatform): ProviderSpec {
    switch (platform) {
      case AdPlatform.meta:
        return {
          scope:
            'ads_management,ads_read,business_management,pages_read_engagement,pages_manage_metadata,pages_manage_posts',
          authorizeUrl: ({ clientId, redirectUri, state, scope }) => {
            const u = new URL('https://www.facebook.com/v22.0/dialog/oauth');
            u.searchParams.set('client_id', clientId);
            u.searchParams.set('redirect_uri', redirectUri);
            u.searchParams.set('state', state);
            u.searchParams.set('scope', scope);
            u.searchParams.set('response_type', 'code');
            return u.toString();
          },
          exchange: async ({ code, redirectUri, config, fetchImpl }) => {
            const clientId = required(config, 'META_APP_ID');
            const clientSecret = required(config, 'META_APP_SECRET');
            const u = new URL(`${META_BASE}/oauth/access_token`);
            u.searchParams.set('client_id', clientId);
            u.searchParams.set('client_secret', clientSecret);
            u.searchParams.set('redirect_uri', redirectUri);
            u.searchParams.set('code', code);
            const res = await fetchImpl(u.toString(), { method: 'GET' });
            if (!res.ok) {
              throw new Error(`meta exchange failed: HTTP ${res.status}`);
            }
            const json = (await res.json()) as {
              access_token: string;
              expires_in?: number;
              token_type?: string;
            };
            return {
              accessToken: json.access_token,
              refreshToken: null,
              expiresAt: json.expires_in
                ? new Date(Date.now() + json.expires_in * 1000)
                : null,
              extra: { token_type: json.token_type ?? 'bearer' },
            };
          },
        };

      case AdPlatform.google_ads:
        return {
          scope: 'https://www.googleapis.com/auth/adwords openid email',
          authorizeUrl: ({ clientId, redirectUri, state, scope }) => {
            const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            u.searchParams.set('client_id', clientId);
            u.searchParams.set('redirect_uri', redirectUri);
            u.searchParams.set('state', state);
            u.searchParams.set('scope', scope);
            u.searchParams.set('response_type', 'code');
            u.searchParams.set('access_type', 'offline');
            u.searchParams.set('prompt', 'consent');
            u.searchParams.set('include_granted_scopes', 'true');
            return u.toString();
          },
          exchange: async ({ code, redirectUri, config, fetchImpl }) => {
            const clientId = required(config, 'GOOGLE_ADS_CLIENT_ID');
            const clientSecret = required(config, 'GOOGLE_ADS_CLIENT_SECRET');
            const body = new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            });
            const res = await fetchImpl('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body.toString(),
            });
            if (!res.ok) {
              throw new Error(`google exchange failed: HTTP ${res.status}`);
            }
            const json = (await res.json()) as {
              access_token: string;
              refresh_token?: string;
              expires_in?: number;
            };
            return {
              accessToken: json.access_token,
              refreshToken: json.refresh_token ?? null,
              expiresAt: json.expires_in
                ? new Date(Date.now() + json.expires_in * 1000)
                : null,
            };
          },
        };

      case AdPlatform.tiktok_ads:
        return {
          scope: 'business_basic',
          authorizeUrl: ({ clientId, redirectUri, state }) => {
            const u = new URL('https://business-api.tiktok.com/portal/auth');
            u.searchParams.set('app_id', clientId);
            u.searchParams.set('redirect_uri', redirectUri);
            u.searchParams.set('state', state);
            return u.toString();
          },
          exchange: async ({ code, redirectUri: _redirectUri, config, fetchImpl }) => {
            const appId = required(config, 'TIKTOK_APP_ID');
            const secret = required(config, 'TIKTOK_APP_SECRET');
            const res = await fetchImpl(
              'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  app_id: appId,
                  secret,
                  auth_code: code,
                }),
              },
            );
            if (!res.ok) {
              throw new Error(`tiktok exchange failed: HTTP ${res.status}`);
            }
            const json = (await res.json()) as {
              code?: number;
              data?: {
                access_token: string;
                refresh_token?: string;
                expires_in?: number;
                advertiser_ids?: string[];
              };
              message?: string;
            };
            if (json.code && json.code !== 0) {
              throw new Error(`tiktok exchange returned code=${json.code}: ${json.message ?? 'unknown'}`);
            }
            const data = (json.data ?? {}) as NonNullable<typeof json.data>;
            if (!data.access_token) {
              throw new Error('tiktok exchange: missing access_token');
            }
            return {
              accessToken: data.access_token,
              refreshToken: data.refresh_token ?? null,
              expiresAt: data.expires_in
                ? new Date(Date.now() + data.expires_in * 1000)
                : null,
              extra: data.advertiser_ids?.length
                ? { advertiser_ids: data.advertiser_ids }
                : null,
            };
          },
        };

      default:
        throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Config helpers
  // ---------------------------------------------------------------------------

  private buildRedirectUri(platform: AdPlatform): string {
    const explicit = this.config.get<string>(this.redirectEnv(platform));
    if (explicit) return explicit;
    const apiUrl = this.config.get<string>('API_URL') || 'http://localhost:3000';
    return `${apiUrl.replace(/\/$/, '')}/oauth/${platform}/callback`;
  }

  private clientIdEnv(platform: AdPlatform): string {
    switch (platform) {
      case AdPlatform.meta:
        return 'META_APP_ID';
      case AdPlatform.google_ads:
        return 'GOOGLE_ADS_CLIENT_ID';
      case AdPlatform.tiktok_ads:
        return 'TIKTOK_APP_ID';
      default:
        throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
  }

  private redirectEnv(platform: AdPlatform): string {
    switch (platform) {
      case AdPlatform.meta:
        return 'META_OAUTH_REDIRECT_URI';
      case AdPlatform.google_ads:
        return 'GOOGLE_ADS_OAUTH_REDIRECT_URI';
      case AdPlatform.tiktok_ads:
        return 'TIKTOK_OAUTH_REDIRECT_URI';
      default:
        throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
  }

  private requireConfig(env: string): string {
    return required(this.config, env);
  }

  private async audit(
    tenantId: string,
    userId: number | null,
    type: EventType,
    severity: EventSeverity,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.systemEvents.logEvent(
        type,
        EventModule.AD_PLATFORM_OAUTH,
        payload,
        userId,
        severity,
        tenantId,
      );
    } catch (err) {
      this.logger.warn(`Failed to audit ${type}: ${(err as Error).message}`);
    }
  }
}

function required(config: ConfigService, env: string): string {
  const v = config.get<string>(env);
  if (!v) throw new BadRequestException(`Missing required env: ${env}`);
  return v;
}
