import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppsService } from './apps.service';
import { PrismaService } from '../prisma.service';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

describe('AppsService — tenant isolation', () => {
  let service: AppsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      app: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      linesStock: {
        findFirst: jest.fn(),
      },
    };
    service = new AppsService(prisma as PrismaService);
  });

  describe('findAll', () => {
    it('only returns apps for the calling tenant', async () => {
      prisma.app.findMany.mockResolvedValueOnce([{ id: 1, tenantId: TENANT_A }]);

      const result = await service.findAll(TENANT_A);
      expect(prisma.app.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_A },
        orderBy: { createdAt: 'desc' },
      });
      expect(result[0].tenantId).toBe(TENANT_A);
    });
  });

  describe('findOne', () => {
    it('refuses to return an app from another tenant', async () => {
      prisma.app.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(TENANT_A, 42)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.app.findFirst).toHaveBeenCalledWith({
        where: { id: 42, tenantId: TENANT_A },
      });
    });
  });

  describe('create', () => {
    it('allows two tenants to use the same app name (per-tenant uniqueness)', async () => {
      // tenant A creates "Main App"
      prisma.app.findFirst.mockResolvedValueOnce(null);
      prisma.app.create.mockResolvedValueOnce({
        id: 1,
        name: 'Main App',
        tenantId: TENANT_A,
      });

      await service.create(TENANT_A, {
        name: 'Main App',
        accessToken: 'token-a',
      } as any);
      expect(prisma.app.findFirst).toHaveBeenLastCalledWith({
        where: { name: 'Main App', tenantId: TENANT_A },
      });

      // tenant B creates the same name — must not collide with tenant A's
      prisma.app.findFirst.mockResolvedValueOnce(null);
      prisma.app.create.mockResolvedValueOnce({
        id: 2,
        name: 'Main App',
        tenantId: TENANT_B,
      });

      await service.create(TENANT_B, {
        name: 'Main App',
        accessToken: 'token-b',
      } as any);
      expect(prisma.app.findFirst).toHaveBeenLastCalledWith({
        where: { name: 'Main App', tenantId: TENANT_B },
      });
    });

    it('blocks duplicate name within the same tenant', async () => {
      prisma.app.findFirst.mockResolvedValueOnce({ id: 1, name: 'Main App' });

      await expect(
        service.create(TENANT_A, {
          name: 'Main App',
          accessToken: 'token-a',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.app.create).not.toHaveBeenCalled();
    });
  });

  describe('update / remove', () => {
    it('update gates on tenant-scoped findOne before mutating', async () => {
      prisma.app.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.update(TENANT_A, 99, { name: 'pwn' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.app.update).not.toHaveBeenCalled();
    });

    it('remove checks linesStock with tenantId scope', async () => {
      prisma.app.findFirst.mockResolvedValueOnce({
        id: 1,
        name: 'Main App',
        tenantId: TENANT_A,
      });
      prisma.linesStock.findFirst.mockResolvedValueOnce(null);
      prisma.app.delete.mockResolvedValueOnce({ id: 1 });

      await service.remove(TENANT_A, 1);

      expect(prisma.linesStock.findFirst).toHaveBeenCalledWith({
        where: { appId: 1, tenantId: TENANT_A },
      });
    });
  });
});
