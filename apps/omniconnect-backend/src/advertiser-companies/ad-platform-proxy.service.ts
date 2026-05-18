import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AdPlatform } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AdPlatformConnectionsService } from '../ad-platform-connections/ad-platform-connections.service';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';
import { PlatformProxyDto } from './dto/platform-proxy.dto';

export const PLATFORM_PROXY_FETCH = Symbol('PLATFORM_PROXY_FETCH');

const META_BASE_URL = 'https://graph.facebook.com/v22.0';
const GOOGLE_ADS_BASE_URL = 'https://googleads.googleapis.com/v17';
const TIKTOK_ADS_BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface PlatformProxyResult {
  status: number;
  ok: boolean;
  data: unknown;
}

/**
 * Outbound proxy for external ad-platform APIs. Mirrors the role of the
 * Supabase `meta-api-proxy` / `google-ads-proxy` / `tiktok-ads-proxy`
 * edge functions, but with three differences:
 *
 *  1. The plaintext OAuth token NEVER leaves this service. It is fetched
 *     on demand from AdPlatformConnectionsService.getDecryptedAccessToken
 *     and dropped immediately after the fetch.
 *  2. Tenant scoping is enforced at every step: the advertiser company,
 *     the platform connection, the audit log — all rejected if they do
 *     not belong to the caller's tenant.
 *  3. Every call is audited via SystemEventsService (success or error).
 *     Audit metadata never includes tokens or response bodies.
 */
@Injectable()
export class AdPlatformProxyService {
  private readonly logger = new Logger(AdPlatformProxyService.name);
  private readonly fetchImpl: FetchFn;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: AdPlatformConnectionsService,
    private readonly systemEvents: SystemEventsService,
    @Optional() @Inject(PLATFORM_PROXY_FETCH) injectedFetch?: FetchFn,
  ) {
    this.fetchImpl = injectedFetch ?? ((globalThis as any).fetch as FetchFn);
  }

  async proxy(
    tenantId: string,
    advertiserCompanyId: string,
    platform: AdPlatform,
    dto: PlatformProxyDto,
    actorUserId?: number,
  ): Promise<PlatformProxyResult> {
    this.assertSafeEndpoint(dto.endpoint);

    const company = await this.prisma.advertiserCompany.findFirst({
      where: { id: advertiserCompanyId, tenantId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException('Advertiser company not found for this tenant');
    }

    const connection = await this.prisma.adPlatformConnection.findUnique({
      where: {
        advertiserCompanyId_platform: { advertiserCompanyId, platform },
      },
      select: { id: true, tenantId: true },
    });
    if (!connection || connection.tenantId !== tenantId) {
      throw new NotFoundException(
        `No active ${platform} connection for this advertiser company`,
      );
    }

    const { accessToken } = await this.connections.getDecryptedAccessToken(
      tenantId,
      connection.id,
    );

    const method = dto.method ?? 'GET';
    const url = this.buildUrl(platform, dto.endpoint, dto.params);
    const init = this.buildRequestInit(platform, accessToken, method, dto.body);

    const start = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (err) {
      await this.audit(tenantId, actorUserId, platform, advertiserCompanyId, {
        endpoint: dto.endpoint,
        method,
        ok: false,
        status: 0,
        durationMs: Date.now() - start,
        error: (err as Error)?.message ?? 'fetch_failed',
      });
      throw new BadGatewayException(`Provider call failed: ${(err as Error).message}`);
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    await this.audit(tenantId, actorUserId, platform, advertiserCompanyId, {
      endpoint: dto.endpoint,
      method,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - start,
    });

    return { status: response.status, ok: response.ok, data };
  }

  private buildUrl(
    platform: AdPlatform,
    endpoint: string,
    params?: Record<string, string>,
  ): string {
    const base = this.baseUrl(platform);
    const url = new URL(`${base}${endpoint}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private baseUrl(platform: AdPlatform): string {
    switch (platform) {
      case AdPlatform.meta:
        return META_BASE_URL;
      case AdPlatform.google_ads:
        return GOOGLE_ADS_BASE_URL;
      case AdPlatform.tiktok_ads:
        return TIKTOK_ADS_BASE_URL;
      default:
        throw new BadRequestException(`Unsupported platform: ${String(platform)}`);
    }
  }

  /**
   * Provider-specific request envelope:
   *  - Meta:    access_token goes in querystring (Graph convention).
   *  - Google:  Authorization: Bearer ... header.
   *  - TikTok:  Access-Token header (provider's documented spec).
   * Body, if present, is always JSON-encoded.
   */
  private buildRequestInit(
    platform: AdPlatform,
    accessToken: string,
    method: 'GET' | 'POST' | 'DELETE',
    body?: Record<string, unknown>,
  ): RequestInit {
    const init: RequestInit = { method };
    const headers: Record<string, string> = {};
    if (body && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    if (platform === AdPlatform.google_ads) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else if (platform === AdPlatform.tiktok_ads) {
      headers['Access-Token'] = accessToken;
    }
    init.headers = headers;
    return init;
  }

  /**
   * URL injection / SSRF defense. Only relative paths starting with "/"
   * are accepted, and only for the configured providers. We refuse
   * embedded "://" (to forbid absolute URLs) and "..", to prevent
   * traversal-style bypasses against the base URL.
   */
  private assertSafeEndpoint(endpoint: string): void {
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      throw new BadRequestException('endpoint is required');
    }
    if (!endpoint.startsWith('/')) {
      throw new BadRequestException('endpoint must be a provider-relative path starting with "/"');
    }
    if (endpoint.includes('://') || endpoint.includes('..')) {
      throw new BadRequestException('endpoint must not contain "://" or ".."');
    }
  }

  private async audit(
    tenantId: string,
    userId: number | undefined,
    platform: AdPlatform,
    advertiserCompanyId: string,
    meta: {
      endpoint: string;
      method: string;
      ok: boolean;
      status: number;
      durationMs: number;
      error?: string;
    },
  ): Promise<void> {
    try {
      await this.systemEvents.logEvent(
        EventType.AD_PLATFORM_PROXY_CALL,
        EventModule.AD_PLATFORM_PROXY,
        {
          platform,
          advertiserCompanyId,
          endpoint: meta.endpoint,
          method: meta.method,
          status: meta.status,
          durationMs: meta.durationMs,
          ...(meta.error ? { error: meta.error } : {}),
        },
        userId ?? null,
        meta.ok ? EventSeverity.INFO : EventSeverity.WARNING,
        tenantId,
      );
    } catch (err) {
      this.logger.warn(`Failed to audit proxy call: ${(err as Error).message}`);
    }
  }
}
