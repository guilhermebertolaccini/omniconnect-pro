import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AdPlatform } from '@prisma/client';
import {
  AdPlatformTokensService,
  TOKEN_REFRESH_FETCH,
} from './ad-platform-tokens.service';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';

interface Row {
  id: string;
  tenantId: string;
  platform: AdPlatform;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  isActive: boolean;
  extra: any;
}

describe('AdPlatformTokensService', () => {
  let service: AdPlatformTokensService;
  let prisma: any;
  let config: any;
  let cipher: jest.Mocked<BridgeSecretCipher>;
  let systemEvents: { logEvent: jest.Mock };
  let fetchMock: jest.Mock;
  let store: Map<string, Row>;

  function row(overrides: Partial<Row> = {}): Row {
    return {
      id: 'r-1',
      tenantId: 'tenant-a',
      platform: AdPlatform.meta,
      accessTokenEncrypted: 'enc:meta-old',
      refreshTokenEncrypted: null,
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1d
      isActive: true,
      extra: null,
      ...overrides,
    };
  }

  beforeEach(async () => {
    store = new Map();
    prisma = {
      adPlatformConnection: {
        findMany: jest.fn(async () => Array.from(store.values())),
        update: jest.fn(async ({ where, data }: any) => {
          const r = store.get(where.id);
          if (!r) throw new Error('not found');
          Object.assign(r, data);
          return r;
        }),
      },
    };
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          META_APP_ID: 'meta-app',
          META_APP_SECRET: 'meta-secret',
          GOOGLE_ADS_CLIENT_ID: 'google-id',
          GOOGLE_ADS_CLIENT_SECRET: 'google-secret',
          TIKTOK_APP_ID: 'tiktok-id',
          TIKTOK_APP_SECRET: 'tiktok-secret',
        };
        return map[key];
      }),
    };
    cipher = {
      encrypt: jest.fn((p: string) => `enc:${p}`),
      decrypt: jest.fn((p: string) => p.replace(/^enc:/, '')),
      decryptWithLegacyFallback: jest.fn((p: string) => p.replace(/^enc:/, '')),
    } as any;
    systemEvents = { logEvent: jest.fn(async () => undefined) };
    fetchMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdPlatformTokensService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: BridgeSecretCipher, useValue: cipher },
        { provide: SystemEventsService, useValue: systemEvents },
        { provide: TOKEN_REFRESH_FETCH, useValue: fetchMock },
      ],
    }).compile();
    service = module.get(AdPlatformTokensService);
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  describe('Meta refresh', () => {
    it('exchanges long-lived token, re-encrypts, updates expiry, audits success', async () => {
      const r = row({ id: 'meta-1', platform: AdPlatform.meta });
      store.set(r.id, r);
      fetchMock.mockResolvedValue(
        jsonResponse({ access_token: 'NEW-META-TOKEN', expires_in: 5184000 }),
      );

      const summary = await service.scanAndRefresh();
      expect(summary.refreshed).toBe(1);

      expect(cipher.decryptWithLegacyFallback).toHaveBeenCalledWith('enc:meta-old');
      expect(cipher.encrypt).toHaveBeenCalledWith('NEW-META-TOKEN');
      const stored = store.get(r.id)!;
      expect(stored.accessTokenEncrypted).toBe('enc:NEW-META-TOKEN');
      expect(stored.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 5183000 * 1000);
      // Audit
      const args = systemEvents.logEvent.mock.calls[0];
      expect(args[0]).toBe(EventType.AD_PLATFORM_TOKEN_REFRESHED);
      expect(args[1]).toBe(EventModule.AD_PLATFORM_TOKEN_REFRESH);
      expect(args[4]).toBe(EventSeverity.INFO);
      expect(args[5]).toBe('tenant-a');
    });

    it('audits FAILED on HTTP error and does not touch row', async () => {
      const r = row({ id: 'meta-err' });
      store.set(r.id, r);
      fetchMock.mockResolvedValue(jsonResponse({ error: 'denied' }, 400));

      const summary = await service.scanAndRefresh();
      expect(summary.failed).toBe(1);
      expect(prisma.adPlatformConnection.update).not.toHaveBeenCalled();
      const args = systemEvents.logEvent.mock.calls[0];
      expect(args[0]).toBe(EventType.AD_PLATFORM_TOKEN_REFRESH_FAILED);
      expect(args[4]).toBe(EventSeverity.ERROR);
    });

    it('skips when META_APP_ID/SECRET are missing', async () => {
      config.get.mockReturnValue(undefined);
      const r = row({ id: 'meta-noenv' });
      store.set(r.id, r);
      const summary = await service.scanAndRefresh();
      expect(summary.skipped).toBe(1);
      expect(summary.refreshed).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Google refresh', () => {
    it('uses refresh_token grant, audits success', async () => {
      const r = row({
        id: 'g-1',
        platform: AdPlatform.google_ads,
        accessTokenEncrypted: 'enc:old',
        refreshTokenEncrypted: 'enc:refresh-XYZ',
      });
      store.set(r.id, r);
      fetchMock.mockResolvedValue(
        jsonResponse({ access_token: 'NEW-GOOGLE', expires_in: 3600 }),
      );

      const summary = await service.scanAndRefresh();
      expect(summary.refreshed).toBe(1);
      expect(cipher.decryptWithLegacyFallback).toHaveBeenCalledWith('enc:refresh-XYZ');
      expect(cipher.encrypt).toHaveBeenCalledWith('NEW-GOOGLE');
      const [, init] = fetchMock.mock.calls[0];
      expect(String(init.body)).toContain('grant_type=refresh_token');
      expect(String(init.body)).toContain('refresh_token=refresh-XYZ');
    });

    it('marks connection expired when already past TTL and refresh_token absent', async () => {
      const past = new Date(Date.now() - 60_000);
      const r = row({
        id: 'g-exp',
        platform: AdPlatform.google_ads,
        accessTokenEncrypted: 'enc:old',
        refreshTokenEncrypted: null,
        tokenExpiresAt: past,
      });
      store.set(r.id, r);
      const summary = await service.scanAndRefresh();
      expect(summary.expired).toBe(1);
      expect(store.get(r.id)!.isActive).toBe(false);
      const args = systemEvents.logEvent.mock.calls[0];
      expect(args[0]).toBe(EventType.AD_PLATFORM_TOKEN_EXPIRED);
      expect(args[4]).toBe(EventSeverity.WARNING);
    });
  });

  describe('TikTok refresh', () => {
    it('cycles access + refresh tokens, audits success', async () => {
      const r = row({
        id: 't-1',
        platform: AdPlatform.tiktok_ads,
        accessTokenEncrypted: 'enc:old-access',
        refreshTokenEncrypted: 'enc:old-refresh',
      });
      store.set(r.id, r);
      fetchMock.mockResolvedValue(
        jsonResponse({
          code: 0,
          data: {
            access_token: 'NEW-TT-ACCESS',
            refresh_token: 'NEW-TT-REFRESH',
            access_token_expire_in: 86400,
          },
        }),
      );
      const summary = await service.scanAndRefresh();
      expect(summary.refreshed).toBe(1);
      expect(cipher.encrypt).toHaveBeenCalledWith('NEW-TT-ACCESS');
      expect(cipher.encrypt).toHaveBeenCalledWith('NEW-TT-REFRESH');
      const stored = store.get(r.id)!;
      expect(stored.accessTokenEncrypted).toBe('enc:NEW-TT-ACCESS');
      expect(stored.refreshTokenEncrypted).toBe('enc:NEW-TT-REFRESH');
    });

    it('audits FAILED when TikTok code != 0', async () => {
      const r = row({
        id: 't-err',
        platform: AdPlatform.tiktok_ads,
        accessTokenEncrypted: 'enc:old',
        refreshTokenEncrypted: 'enc:refresh',
      });
      store.set(r.id, r);
      fetchMock.mockResolvedValue(jsonResponse({ code: 40105, message: 'expired' }));
      const summary = await service.scanAndRefresh();
      expect(summary.failed).toBe(1);
      expect(systemEvents.logEvent.mock.calls[0][0]).toBe(
        EventType.AD_PLATFORM_TOKEN_REFRESH_FAILED,
      );
    });
  });

  describe('multi-tenant scan', () => {
    it('processes connections across tenants and audits each with the correct tenantId', async () => {
      const a = row({ id: 'a', tenantId: 'tenant-a', platform: AdPlatform.meta });
      const b = row({ id: 'b', tenantId: 'tenant-b', platform: AdPlatform.meta });
      store.set(a.id, a);
      store.set(b.id, b);
      // mockImplementation returns a fresh Response per call so each
      // `res.json()` has a readable body.
      fetchMock.mockImplementation(async () =>
        jsonResponse({ access_token: 'X', expires_in: 1000 }),
      );

      const summary = await service.scanAndRefresh();
      expect(summary.processed).toBe(2);
      expect(summary.refreshed).toBe(2);
      const tenants = systemEvents.logEvent.mock.calls.map((c: any[]) => c[5]);
      expect(tenants).toEqual(expect.arrayContaining(['tenant-a', 'tenant-b']));
    });
  });
});
