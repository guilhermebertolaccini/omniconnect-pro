import { Test, TestingModule } from '@nestjs/testing';
import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AdPlatform } from '@prisma/client';
import {
  AdPlatformProxyService,
  PLATFORM_PROXY_FETCH,
} from './ad-platform-proxy.service';
import { PrismaService } from '../prisma.service';
import { AdPlatformConnectionsService } from '../ad-platform-connections/ad-platform-connections.service';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';

describe('AdPlatformProxyService', () => {
  let service: AdPlatformProxyService;
  let prisma: any;
  let connections: { getDecryptedAccessToken: jest.Mock };
  let systemEvents: { logEvent: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    prisma = {
      advertiserCompany: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.id === 'ac-1' && where.tenantId === 'tenant-a') {
            return { id: 'ac-1' };
          }
          return null;
        }),
      },
      adPlatformConnection: {
        findUnique: jest.fn(async ({ where }: any) => {
          const { advertiserCompanyId, platform } =
            where.advertiserCompanyId_platform;
          if (advertiserCompanyId === 'ac-1' && platform === AdPlatform.meta) {
            return { id: 'conn-1', tenantId: 'tenant-a' };
          }
          if (
            advertiserCompanyId === 'ac-1' &&
            platform === AdPlatform.google_ads
          ) {
            return { id: 'conn-2', tenantId: 'tenant-a' };
          }
          if (
            advertiserCompanyId === 'ac-1' &&
            platform === AdPlatform.tiktok_ads
          ) {
            return { id: 'conn-3', tenantId: 'tenant-a' };
          }
          // Cross-tenant connection: belongs to tenant-b
          if (advertiserCompanyId === 'ac-leak' && platform === AdPlatform.meta) {
            return { id: 'conn-leak', tenantId: 'tenant-b' };
          }
          return null;
        }),
      },
    };
    connections = {
      getDecryptedAccessToken: jest.fn(async (tenantId: string, id: string) => {
        if (tenantId === 'tenant-a' && id === 'conn-1') {
          return { accessToken: 'META-TOKEN', platform: AdPlatform.meta, accountId: null, extra: null };
        }
        if (tenantId === 'tenant-a' && id === 'conn-2') {
          return { accessToken: 'GOOGLE-TOKEN', platform: AdPlatform.google_ads, accountId: null, extra: null };
        }
        if (tenantId === 'tenant-a' && id === 'conn-3') {
          return { accessToken: 'TIKTOK-TOKEN', platform: AdPlatform.tiktok_ads, accountId: null, extra: null };
        }
        throw new NotFoundException();
      }),
    };
    systemEvents = { logEvent: jest.fn(async () => undefined) };
    fetchMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdPlatformProxyService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdPlatformConnectionsService, useValue: connections },
        { provide: SystemEventsService, useValue: systemEvents },
        { provide: PLATFORM_PROXY_FETCH, useValue: fetchMock },
      ],
    }).compile();

    service = module.get(AdPlatformProxyService);
  });

  function okResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  describe('endpoint validation', () => {
    it('rejects absolute URLs', async () => {
      await expect(
        service.proxy('tenant-a', 'ac-1', AdPlatform.meta, {
          endpoint: 'https://evil.example/x',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects traversal-style endpoints', async () => {
      await expect(
        service.proxy('tenant-a', 'ac-1', AdPlatform.meta, {
          endpoint: '/../../etc/passwd',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects endpoints not starting with "/"', async () => {
      await expect(
        service.proxy('tenant-a', 'ac-1', AdPlatform.meta, {
          endpoint: 'me/adaccounts',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('tenant scoping', () => {
    it('refuses when the advertiser company is in another tenant', async () => {
      await expect(
        service.proxy('tenant-b', 'ac-1', AdPlatform.meta, {
          endpoint: '/me',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses when the connection row belongs to another tenant', async () => {
      // ac-leak doesn't even exist for tenant-a so we go through tenant-b first
      prisma.advertiserCompany.findFirst.mockResolvedValueOnce({ id: 'ac-leak' });
      await expect(
        service.proxy('tenant-a', 'ac-leak', AdPlatform.meta, { endpoint: '/me' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Meta proxy', () => {
    it('puts access_token in querystring, never in headers', async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [{ id: '1' }] }));
      await service.proxy('tenant-a', 'ac-1', AdPlatform.meta, {
        endpoint: '/me/adaccounts',
        params: { fields: 'name,account_id' },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('https://graph.facebook.com/v22.0/me/adaccounts');
      expect(String(url)).toContain('fields=name%2Caccount_id');
      // Meta convention: token in query, not in Authorization header
      expect(init.headers?.Authorization).toBeUndefined();
      expect(init.headers?.['Access-Token']).toBeUndefined();
    });

    it('returns provider status code on non-2xx (still resolves, ok=false)', async () => {
      fetchMock.mockResolvedValue(okResponse({ error: { message: 'denied' } }, 400));
      const result = await service.proxy('tenant-a', 'ac-1', AdPlatform.meta, {
        endpoint: '/me',
      });
      expect(result.status).toBe(400);
      expect(result.ok).toBe(false);
    });
  });

  describe('Google Ads proxy', () => {
    it('uses Authorization: Bearer header', async () => {
      fetchMock.mockResolvedValue(okResponse({ results: [] }));
      await service.proxy('tenant-a', 'ac-1', AdPlatform.google_ads, {
        endpoint: '/customers/123/googleAds:search',
        method: 'POST',
        body: { query: 'SELECT campaign.id FROM campaign' },
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer GOOGLE-TOKEN');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.body).toContain('campaign.id');
    });
  });

  describe('TikTok Ads proxy', () => {
    it('uses Access-Token header', async () => {
      fetchMock.mockResolvedValue(okResponse({ code: 0, data: {} }));
      await service.proxy('tenant-a', 'ac-1', AdPlatform.tiktok_ads, {
        endpoint: '/campaign/get/',
        params: { advertiser_id: '999' },
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('business-api.tiktok.com');
      expect(init.headers['Access-Token']).toBe('TIKTOK-TOKEN');
    });
  });

  describe('audit', () => {
    it('logs INFO on successful call (no token in metadata)', async () => {
      fetchMock.mockResolvedValue(okResponse({ data: 1 }));
      await service.proxy('tenant-a', 'ac-1', AdPlatform.meta, { endpoint: '/me' }, 42);

      expect(systemEvents.logEvent).toHaveBeenCalledTimes(1);
      const args = systemEvents.logEvent.mock.calls[0];
      expect(args[0]).toBe(EventType.AD_PLATFORM_PROXY_CALL);
      expect(args[1]).toBe(EventModule.AD_PLATFORM_PROXY);
      expect(args[3]).toBe(42); // userId
      expect(args[4]).toBe(EventSeverity.INFO);
      expect(args[5]).toBe('tenant-a'); // tenantId
      expect(JSON.stringify(args[2])).not.toContain('META-TOKEN');
    });

    it('logs WARNING on non-2xx response', async () => {
      fetchMock.mockResolvedValue(okResponse({ err: 'x' }, 500));
      await service.proxy('tenant-a', 'ac-1', AdPlatform.meta, { endpoint: '/me' });
      expect(systemEvents.logEvent.mock.calls[0][4]).toBe(EventSeverity.WARNING);
    });

    it('translates network failure into BadGateway and still audits the failure', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));
      await expect(
        service.proxy('tenant-a', 'ac-1', AdPlatform.meta, { endpoint: '/me' }),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(systemEvents.logEvent).toHaveBeenCalled();
      const meta = systemEvents.logEvent.mock.calls[0][2];
      expect(meta.error).toBe('ECONNRESET');
      expect(meta.status).toBe(0);
    });
  });
});
