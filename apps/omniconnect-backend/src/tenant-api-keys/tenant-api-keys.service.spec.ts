import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantApiKeysService } from './tenant-api-keys.service';
import { PrismaService } from '../prisma.service';
import { hashApiKey } from './tenant-api-keys.util';

describe('TenantApiKeysService', () => {
  let service: TenantApiKeysService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      tenantApiKey: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantApiKeysService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TenantApiKeysService>(TenantApiKeysService);
  });

  describe('create', () => {
    it('rejects empty tenantId', async () => {
      await expect(service.create({ tenantId: '', label: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects empty label', async () => {
      await expect(service.create({ tenantId: 't1', label: '' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('stores sha256(plaintext) — never the plaintext itself', async () => {
      prisma.tenantApiKey.create.mockResolvedValue({
        id: 'k1',
        tenantId: 't1',
        label: 'CI',
        prefix: 'oc_abc',
        createdAt: new Date(),
        expiresAt: null,
      });

      const result = await service.create({ tenantId: 't1', label: 'CI' });

      const callArg = prisma.tenantApiKey.create.mock.calls[0][0];
      expect(callArg.data.hashedKey).not.toContain(result.plaintext);
      expect(callArg.data.hashedKey).toBe(hashApiKey(result.plaintext));
      expect(callArg.data.label).toBe('CI');
      expect(result.plaintext).toBeTruthy();
    });
  });

  describe('resolve', () => {
    it('returns null for unknown plaintext', async () => {
      prisma.tenantApiKey.findUnique.mockResolvedValue(null);
      const out = await service.resolve('oc_unknown');
      expect(out).toBeNull();
    });

    it('returns null for revoked keys', async () => {
      prisma.tenantApiKey.findUnique.mockResolvedValue({
        id: 'k1', tenantId: 't1', label: 'old', prefix: 'oc_abc',
        revokedAt: new Date('2020-01-01'),
        expiresAt: null,
      });
      const out = await service.resolve('oc_some');
      expect(out).toBeNull();
    });

    it('returns null for expired keys', async () => {
      prisma.tenantApiKey.findUnique.mockResolvedValue({
        id: 'k1', tenantId: 't1', label: 'exp', prefix: 'oc_abc',
        revokedAt: null,
        expiresAt: new Date('2020-01-01'),
      });
      const out = await service.resolve('oc_some');
      expect(out).toBeNull();
    });

    it('returns the resolved tenant on a valid hit', async () => {
      prisma.tenantApiKey.findUnique.mockResolvedValue({
        id: 'k1', tenantId: 't1', label: 'CI', prefix: 'oc_abc',
        revokedAt: null,
        expiresAt: null,
      });
      const out = await service.resolve('oc_valid');
      expect(out).toEqual({
        id: 'k1',
        tenantId: 't1',
        label: 'CI',
        prefix: 'oc_abc',
      });
    });

    it('fires-and-forgets lastUsedAt update without awaiting', async () => {
      prisma.tenantApiKey.findUnique.mockResolvedValue({
        id: 'k1', tenantId: 't1', label: 'CI', prefix: 'oc_abc',
        revokedAt: null,
        expiresAt: null,
      });
      const out = await service.resolve('oc_valid');
      expect(out).not.toBeNull();
      // The promise is not awaited — but it should be triggered.
      expect(prisma.tenantApiKey.update).toHaveBeenCalled();
    });

    it('returns null for empty plaintext', async () => {
      const out = await service.resolve('');
      expect(out).toBeNull();
      expect(prisma.tenantApiKey.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('throws NotFoundException when key does not belong to tenant', async () => {
      prisma.tenantApiKey.findFirst.mockResolvedValue(null);
      await expect(service.revoke('t1', 'kX')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent for already-revoked keys', async () => {
      const revokedAt = new Date('2020-01-01');
      prisma.tenantApiKey.findFirst.mockResolvedValue({ id: 'k1', revokedAt });
      const out = await service.revoke('t1', 'k1');
      expect(out).toEqual({ id: 'k1', revokedAt, alreadyRevoked: true });
      expect(prisma.tenantApiKey.update).not.toHaveBeenCalled();
    });
  });
});
