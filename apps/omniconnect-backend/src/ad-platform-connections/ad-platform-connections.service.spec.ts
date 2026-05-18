import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdPlatform } from '@prisma/client';
import { AdPlatformConnectionsService } from './ad-platform-connections.service';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';

interface ConnectionRow {
  id: string;
  tenantId: string;
  advertiserCompanyId: string;
  platform: AdPlatform;
  accountId: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  isActive: boolean;
  extra: any;
  createdById: number | null;
  createdAt: Date;
  updatedAt: Date;
}

describe('AdPlatformConnectionsService', () => {
  let service: AdPlatformConnectionsService;
  let prisma: any;
  let cipher: jest.Mocked<BridgeSecretCipher>;

  let advertiserCompanyStore: Map<string, { id: string; tenantId: string }>;
  let connectionStore: Map<string, ConnectionRow>;

  beforeEach(async () => {
    advertiserCompanyStore = new Map([
      ['ac-1', { id: 'ac-1', tenantId: 'tenant-a' }],
      ['ac-2', { id: 'ac-2', tenantId: 'tenant-b' }],
    ]);
    connectionStore = new Map();

    prisma = {
      advertiserCompany: {
        findFirst: jest.fn(async ({ where }: any) => {
          const c = advertiserCompanyStore.get(where.id);
          if (!c) return null;
          if (where.tenantId && c.tenantId !== where.tenantId) return null;
          return c;
        }),
      },
      adPlatformConnection: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.advertiserCompanyId_platform) {
            const { advertiserCompanyId, platform } = where.advertiserCompanyId_platform;
            return (
              Array.from(connectionStore.values()).find(
                (r) => r.advertiserCompanyId === advertiserCompanyId && r.platform === platform,
              ) ?? null
            );
          }
          return null;
        }),
        findFirst: jest.fn(async ({ where, select }: any) => {
          const found = Array.from(connectionStore.values()).find((r) => {
            if (r.id !== where.id) return false;
            if (where.tenantId && r.tenantId !== where.tenantId) return false;
            return true;
          });
          if (!found) return null;
          if (!select) return found;
          const out: any = {};
          for (const k of Object.keys(select)) {
            if (select[k]) out[k] = (found as any)[k];
          }
          return out;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          return Array.from(connectionStore.values()).filter((r) => {
            if (where.tenantId && r.tenantId !== where.tenantId) return false;
            if (where.advertiserCompanyId && r.advertiserCompanyId !== where.advertiserCompanyId) return false;
            return true;
          });
        }),
        create: jest.fn(async ({ data }: any) => {
          const row: ConnectionRow = {
            id: `conn-${connectionStore.size + 1}`,
            tenantId: data.tenantId,
            advertiserCompanyId: data.advertiserCompanyId,
            platform: data.platform,
            accountId: data.accountId ?? null,
            accessTokenEncrypted: data.accessTokenEncrypted ?? null,
            refreshTokenEncrypted: data.refreshTokenEncrypted ?? null,
            tokenExpiresAt: data.tokenExpiresAt ?? null,
            isActive: data.isActive ?? true,
            extra: data.extra ?? null,
            createdById: data.createdById ?? null,
            createdAt: new Date('2026-05-18T10:00:00Z'),
            updatedAt: new Date('2026-05-18T10:00:00Z'),
          };
          connectionStore.set(row.id, row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = connectionStore.get(where.id);
          if (!row) throw new Error('not found');
          Object.assign(row, data, { updatedAt: new Date('2026-05-18T11:00:00Z') });
          return row;
        }),
        delete: jest.fn(async ({ where }: any) => {
          const row = connectionStore.get(where.id);
          connectionStore.delete(where.id);
          return row;
        }),
      },
    };

    cipher = {
      encrypt: jest.fn((p: string) => `enc:${p}`),
      decrypt: jest.fn((p: string) => p.replace(/^enc:/, '')),
      decryptWithLegacyFallback: jest.fn((p: string) => p.replace(/^enc:/, '')),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdPlatformConnectionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BridgeSecretCipher, useValue: cipher },
      ],
    }).compile();

    service = module.get(AdPlatformConnectionsService);
  });

  describe('create', () => {
    it('rejects when advertiser company belongs to another tenant', async () => {
      await expect(
        service.create('tenant-a', {
          advertiserCompanyId: 'ac-2',
          platform: AdPlatform.meta,
          accessToken: 'tok',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('encrypts access/refresh tokens before storing', async () => {
      const out = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'meta-access-XYZ1234',
        refreshToken: 'meta-refresh-ABC',
      });

      expect(cipher.encrypt).toHaveBeenCalledWith('meta-access-XYZ1234');
      expect(cipher.encrypt).toHaveBeenCalledWith('meta-refresh-ABC');

      const stored = connectionStore.get(out.id)!;
      expect(stored.accessTokenEncrypted).toBe('enc:meta-access-XYZ1234');
      expect(stored.refreshTokenEncrypted).toBe('enc:meta-refresh-ABC');
      expect(stored.tenantId).toBe('tenant-a');
      expect(out.hasAccessToken).toBe(true);
      expect(out.hasRefreshToken).toBe(true);
      expect(out.accessTokenHint).toBe('1234');
    });

    it('refuses to create a second connection for the same (advertiserCompany, platform)', async () => {
      await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'tok',
      });
      await expect(
        service.create('tenant-a', {
          advertiserCompanyId: 'ac-1',
          platform: AdPlatform.meta,
          accessToken: 'tok2',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows missing tokens (can be filled later)', async () => {
      const out = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.google_ads,
      });
      expect(out.hasAccessToken).toBe(false);
      expect(out.hasRefreshToken).toBe(false);
      expect(cipher.encrypt).not.toHaveBeenCalled();
    });
  });

  describe('findOne / findAll', () => {
    beforeEach(async () => {
      await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'a-tok',
      });
      // seed a parallel tenant-b connection
      advertiserCompanyStore.set('ac-2', { id: 'ac-2', tenantId: 'tenant-b' });
      await service.create('tenant-b', {
        advertiserCompanyId: 'ac-2',
        platform: AdPlatform.meta,
        accessToken: 'b-tok',
      });
    });

    it('hides tokens on list (no hint exposed)', async () => {
      const rows = await service.findAll('tenant-a');
      expect(rows).toHaveLength(1);
      expect(rows[0].accessTokenHint).toBeNull();
      expect(rows[0]).not.toHaveProperty('accessTokenEncrypted' as any);
      expect((rows[0] as any).accessToken).toBeUndefined();
    });

    it('tenant scoping: tenant-a never sees tenant-b connection', async () => {
      const rows = await service.findAll('tenant-a');
      expect(rows.every((r) => r.tenantId === 'tenant-a')).toBe(true);
    });

    it('findOne throws 404 across tenants', async () => {
      const tenantBConn = Array.from(connectionStore.values()).find((r) => r.tenantId === 'tenant-b')!;
      await expect(service.findOne('tenant-a', tenantBConn.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('re-encrypts access token on rotation', async () => {
      const created = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'old',
      });
      cipher.encrypt.mockClear();

      await service.update('tenant-a', created.id, { accessToken: 'rotated-NEW9999' });

      expect(cipher.encrypt).toHaveBeenCalledWith('rotated-NEW9999');
      const stored = connectionStore.get(created.id)!;
      expect(stored.accessTokenEncrypted).toBe('enc:rotated-NEW9999');
    });

    it('refuses to update a connection from another tenant', async () => {
      const created = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'old',
      });
      await expect(
        service.update('tenant-b', created.id, { isActive: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getDecryptedAccessToken', () => {
    it('returns plaintext for active connections within the same tenant', async () => {
      const created = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'plain-XYZ',
      });
      const result = await service.getDecryptedAccessToken('tenant-a', created.id);
      expect(result.accessToken).toBe('plain-XYZ');
      expect(result.platform).toBe(AdPlatform.meta);
    });

    it('refuses inactive connections', async () => {
      const created = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'plain',
      });
      await service.update('tenant-a', created.id, { isActive: false });
      await expect(service.getDecryptedAccessToken('tenant-a', created.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses connections without a stored token', async () => {
      const created = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.tiktok_ads,
      });
      await expect(service.getDecryptedAccessToken('tenant-a', created.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses cross-tenant access', async () => {
      const created = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'plain',
      });
      await expect(
        service.getDecryptedAccessToken('tenant-b', created.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('testConnection', () => {
    it('reports canDecrypt=true for a healthy stored token', async () => {
      const created = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'plain',
      });
      const out = await service.testConnection('tenant-a', created.id);
      expect(out.canDecrypt).toBe(true);
      expect(out.isActive).toBe(true);
    });

    it('reports canDecrypt=false when the stored payload cannot be decrypted', async () => {
      const created = await service.create('tenant-a', {
        advertiserCompanyId: 'ac-1',
        platform: AdPlatform.meta,
        accessToken: 'plain',
      });
      cipher.decryptWithLegacyFallback.mockImplementationOnce(() => {
        throw new Error('boom');
      });
      const out = await service.testConnection('tenant-a', created.id);
      expect(out.canDecrypt).toBe(false);
    });
  });
});
