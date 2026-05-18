import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdPlatform } from '@prisma/client';
import { OAuthService, OAUTH_FETCH } from './oauth.service';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import {
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';

interface CompanyRow {
  id: string;
  tenantId: string;
}

interface ConnRow {
  id: string;
  tenantId: string;
  advertiserCompanyId: string;
  platform: AdPlatform;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  accountId: string | null;
  isActive: boolean;
  extra: any;
  createdById: number | null;
}

describe('OAuthService', () => {
  let service: OAuthService;
  let prisma: any;
  let systemEvents: jest.Mocked<SystemEventsService>;
  let cipher: BridgeSecretCipher;
  let fetchMock: jest.Mock;

  let companyStore: Map<string, CompanyRow>;
  let connStore: Map<string, ConnRow>;
  let nextConnSerial: number;

  const envs: Record<string, string> = {
    META_APP_ID: 'meta-app',
    META_APP_SECRET: 'meta-secret',
    GOOGLE_ADS_CLIENT_ID: 'google-app',
    GOOGLE_ADS_CLIENT_SECRET: 'google-secret',
    TIKTOK_APP_ID: 'tiktok-app',
    TIKTOK_APP_SECRET: 'tiktok-secret',
    API_URL: 'https://api.test',
    FRONTEND_URL: 'https://app.test',
    BRIDGE_SECRET_KEY: 'a'.repeat(64),
  };

  beforeEach(async () => {
    companyStore = new Map([
      ['ac-a', { id: 'ac-a', tenantId: 'tenant-a' }],
      ['ac-b', { id: 'ac-b', tenantId: 'tenant-b' }],
    ]);
    connStore = new Map();
    nextConnSerial = 1;

    prisma = {
      advertiserCompany: {
        findFirst: jest.fn(async ({ where }: any) => {
          const c = companyStore.get(where.id);
          if (!c) return null;
          if (where.tenantId && c.tenantId !== where.tenantId) return null;
          return { id: c.id };
        }),
      },
      adPlatformConnection: {
        findUnique: jest.fn(async ({ where }: any) => {
          const { advertiserCompanyId, platform } = where.advertiserCompanyId_platform;
          return (
            Array.from(connStore.values()).find(
              (r) =>
                r.advertiserCompanyId === advertiserCompanyId && r.platform === platform,
            ) ?? null
          );
        }),
        create: jest.fn(async ({ data }: any) => {
          const row: ConnRow = {
            id: `c-${nextConnSerial++}`,
            tenantId: data.tenantId,
            advertiserCompanyId: data.advertiserCompanyId,
            platform: data.platform,
            accessTokenEncrypted: data.accessTokenEncrypted,
            refreshTokenEncrypted: data.refreshTokenEncrypted,
            tokenExpiresAt: data.tokenExpiresAt,
            accountId: data.accountId ?? null,
            isActive: data.isActive ?? true,
            extra: data.extra ?? null,
            createdById: data.createdById ?? null,
          };
          connStore.set(row.id, row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = connStore.get(where.id);
          if (!row) throw new Error('NOT_FOUND');
          Object.assign(row, data);
          return row;
        }),
      },
    };

    systemEvents = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SystemEventsService>;

    const config = {
      get: jest.fn((k: string) => envs[k]),
    } as unknown as ConfigService;

    cipher = new BridgeSecretCipher(config);

    fetchMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: BridgeSecretCipher, useValue: cipher },
        { provide: SystemEventsService, useValue: systemEvents },
        { provide: OAUTH_FETCH, useValue: fetchMock },
      ],
    }).compile();

    service = module.get(OAuthService);
  });

  // ---------- start ----------

  it('start builds an authorize URL with cipher-encoded state', async () => {
    const result = await service.buildAuthorizeUrl({
      tenantId: 'tenant-a',
      userId: 5,
      advertiserCompanyId: 'ac-a',
      platform: AdPlatform.meta,
    });

    const u = new URL(result.authorizeUrl);
    expect(u.hostname).toBe('www.facebook.com');
    expect(u.searchParams.get('client_id')).toBe('meta-app');
    expect(u.searchParams.get('redirect_uri')).toBe('https://api.test/oauth/meta/callback');
    const state = u.searchParams.get('state');
    expect(state).toBeTruthy();
    // O state em si NÃO pode conter tenantId em claro
    expect(state!).not.toContain('tenant-a');
    expect(state!).not.toContain('ac-a');
    expect(systemEvents.logEvent).toHaveBeenCalledWith(
      EventType.AD_PLATFORM_OAUTH_STARTED,
      expect.any(String),
      expect.objectContaining({ platform: 'meta', advertiserCompanyId: 'ac-a' }),
      5,
      expect.any(String),
      'tenant-a',
    );
  });

  it('start refuses cross-tenant advertiser company', async () => {
    await expect(
      service.buildAuthorizeUrl({
        tenantId: 'tenant-a',
        userId: 5,
        advertiserCompanyId: 'ac-b',
        platform: AdPlatform.meta,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('start requires META_APP_ID env', async () => {
    const original = envs.META_APP_ID;
    delete (envs as any).META_APP_ID;
    await expect(
      service.buildAuthorizeUrl({
        tenantId: 'tenant-a',
        userId: 5,
        advertiserCompanyId: 'ac-a',
        platform: AdPlatform.meta,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    envs.META_APP_ID = original;
  });

  // ---------- callback ----------

  const expectOkFetchMeta = () =>
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'meta-access', expires_in: 7200 }),
        { status: 200 },
      ),
    );

  it('callback: persists encrypted tokens and never touches plaintext outside service', async () => {
    const { state } = await service.buildAuthorizeUrl({
      tenantId: 'tenant-a',
      userId: 5,
      advertiserCompanyId: 'ac-a',
      platform: AdPlatform.meta,
    });
    expectOkFetchMeta();

    const result = await service.handleCallback({
      platform: AdPlatform.meta,
      code: 'code-123',
      state,
      actingUserId: null,
    });

    const row = connStore.get(result.connectionId)!;
    expect(row.tenantId).toBe('tenant-a');
    expect(row.platform).toBe(AdPlatform.meta);
    expect(row.accessTokenEncrypted).toMatch(/^v1\./);
    expect(cipher.decryptWithLegacyFallback(row.accessTokenEncrypted!)).toBe(
      'meta-access',
    );
    expect(systemEvents.logEvent).toHaveBeenCalledWith(
      EventType.AD_PLATFORM_OAUTH_COMPLETED,
      expect.any(String),
      expect.objectContaining({ platform: 'meta' }),
      5,
      expect.any(String),
      'tenant-a',
    );
  });

  it('callback: state expired returns 400 and is audited as failed', async () => {
    const { state } = await service.buildAuthorizeUrl({
      tenantId: 'tenant-a',
      userId: 5,
      advertiserCompanyId: 'ac-a',
      platform: AdPlatform.meta,
    });

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 10 * 60 * 1000);

    await expect(
      service.handleCallback({
        platform: AdPlatform.meta,
        code: 'code-123',
        state,
        actingUserId: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(systemEvents.logEvent).toHaveBeenCalledWith(
      EventType.AD_PLATFORM_OAUTH_FAILED,
      expect.any(String),
      expect.objectContaining({ platform: 'meta' }),
      5,
      expect.any(String),
      'tenant-a',
    );
    (Date.now as jest.Mock).mockRestore?.();
  });

  it('callback: rejects platform mismatch in state', async () => {
    const { state } = await service.buildAuthorizeUrl({
      tenantId: 'tenant-a',
      userId: 5,
      advertiserCompanyId: 'ac-a',
      platform: AdPlatform.meta,
    });

    await expect(
      service.handleCallback({
        platform: AdPlatform.google_ads,
        code: 'code-123',
        state,
        actingUserId: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('callback: rejects garbage state', async () => {
    await expect(
      service.handleCallback({
        platform: AdPlatform.meta,
        code: 'x',
        state: 'not-a-real-state',
        actingUserId: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('callback: Google exchange persists refresh_token and expiresAt', async () => {
    const { state } = await service.buildAuthorizeUrl({
      tenantId: 'tenant-a',
      userId: 5,
      advertiserCompanyId: 'ac-a',
      platform: AdPlatform.google_ads,
    });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'g-access',
          refresh_token: 'g-refresh',
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );

    const result = await service.handleCallback({
      platform: AdPlatform.google_ads,
      code: 'g-code',
      state,
      actingUserId: null,
    });

    const row = connStore.get(result.connectionId)!;
    expect(cipher.decryptWithLegacyFallback(row.accessTokenEncrypted!)).toBe('g-access');
    expect(cipher.decryptWithLegacyFallback(row.refreshTokenEncrypted!)).toBe('g-refresh');
    expect(row.tokenExpiresAt).toBeInstanceOf(Date);
  });

  it('callback: provider non-2xx rotates audit as FAILED and re-throws', async () => {
    const { state } = await service.buildAuthorizeUrl({
      tenantId: 'tenant-a',
      userId: 5,
      advertiserCompanyId: 'ac-a',
      platform: AdPlatform.meta,
    });
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 400 }));

    await expect(
      service.handleCallback({
        platform: AdPlatform.meta,
        code: 'code-123',
        state,
        actingUserId: null,
      }),
    ).rejects.toThrow(/meta exchange failed/);
    expect(systemEvents.logEvent).toHaveBeenCalledWith(
      EventType.AD_PLATFORM_OAUTH_FAILED,
      expect.any(String),
      expect.objectContaining({ platform: 'meta' }),
      5,
      expect.any(String),
      'tenant-a',
    );
  });

  // ---------- buildFrontendBounceUrl ----------

  it('buildFrontendBounceUrl preserves returnUrl and never echoes secrets', () => {
    const url = service.buildFrontendBounceUrl(AdPlatform.meta, {
      status: 'success',
      connectionId: 'c-1',
      returnUrl: '/settings/ad-platforms',
    });
    const u = new URL(url);
    expect(u.origin).toBe('https://app.test');
    expect(u.pathname).toBe('/settings/ad-platforms');
    expect(u.searchParams.get('platform')).toBe('meta');
    expect(u.searchParams.get('status')).toBe('success');
    expect(u.searchParams.get('connectionId')).toBe('c-1');
  });

  it('buildFrontendBounceUrl ignores absolute returnUrl (no open-redirect)', () => {
    const url = service.buildFrontendBounceUrl(AdPlatform.meta, {
      status: 'success',
      connectionId: 'c-1',
      returnUrl: 'https://evil.com/steal',
    });
    expect(new URL(url).origin).toBe('https://app.test');
  });
});
