import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdvertiserCompaniesService } from './advertiser-companies.service';
import { PrismaService } from '../prisma.service';

interface CompanyRow {
  id: string;
  tenantId: string;
  name: string;
  businessName: string;
  metaBusinessId: string | null;
  currency: string;
  timezone: string;
  status: string;
  totalSpent: number;
  activeCampaigns: number;
  lastSyncAt: Date | null;
  createdById: number | null;
  createdAt: Date;
  updatedAt: Date;
}

describe('AdvertiserCompaniesService', () => {
  let service: AdvertiserCompaniesService;
  let prisma: any;
  let store: Map<string, CompanyRow>;
  let nextId = 1;

  beforeEach(async () => {
    store = new Map();
    nextId = 1;
    prisma = {
      advertiserCompany: {
        create: jest.fn(async ({ data }: any) => {
          const row: CompanyRow = {
            id: `ac-${nextId++}`,
            tenantId: data.tenantId,
            name: data.name,
            businessName: data.businessName,
            metaBusinessId: data.metaBusinessId ?? null,
            currency: data.currency ?? 'BRL',
            timezone: data.timezone ?? 'America/Sao_Paulo',
            status: data.status ?? 'pending',
            totalSpent: 0,
            activeCampaigns: 0,
            lastSyncAt: null,
            createdById: data.createdById ?? null,
            createdAt: new Date('2026-05-18T10:00:00Z'),
            updatedAt: new Date('2026-05-18T10:00:00Z'),
          };
          store.set(row.id, row);
          return row;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          for (const r of store.values()) {
            if (where.id && r.id !== where.id) continue;
            if (where.tenantId && r.tenantId !== where.tenantId) continue;
            return r;
          }
          return null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          return Array.from(store.values()).filter((r) => {
            if (where.tenantId && r.tenantId !== where.tenantId) return false;
            if (where.status && r.status !== where.status) return false;
            if (where.OR && Array.isArray(where.OR)) {
              const term =
                where.OR[0]?.name?.contains ?? where.OR[1]?.businessName?.contains;
              if (term) {
                const hay = `${r.name} ${r.businessName}`.toLowerCase();
                if (!hay.includes(String(term).toLowerCase())) return false;
              }
            }
            return true;
          });
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = store.get(where.id);
          if (!row) throw new Error('not found');
          Object.assign(row, data, { updatedAt: new Date('2026-05-18T11:00:00Z') });
          return row;
        }),
        delete: jest.fn(async ({ where }: any) => {
          const row = store.get(where.id);
          store.delete(where.id);
          return row;
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvertiserCompaniesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AdvertiserCompaniesService);
  });

  describe('create', () => {
    it('rejects empty name', async () => {
      await expect(
        service.create('tenant-a', { name: '   ', businessName: 'Co' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists tenantId from caller, never from body', async () => {
      const out = await service.create('tenant-a', {
        name: 'Acme',
        businessName: 'Acme Ltd',
      } as any);
      expect(out.tenantId).toBe('tenant-a');
      expect(out.name).toBe('Acme');
      expect(out.currency).toBe('BRL');
    });
  });

  describe('findOne / findAll', () => {
    beforeEach(async () => {
      await service.create('tenant-a', { name: 'A1', businessName: 'A1 Ltd' } as any);
      await service.create('tenant-a', { name: 'A2', businessName: 'A2 Ltd' } as any);
      await service.create('tenant-b', { name: 'B1', businessName: 'B1 Ltd' } as any);
    });

    it('returns only the caller tenant rows', async () => {
      const rows = await service.findAll('tenant-a');
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.tenantId === 'tenant-a')).toBe(true);
    });

    it('filters by search term (case-insensitive)', async () => {
      const rows = await service.findAll('tenant-a', 'a1');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('A1');
    });

    it('findOne returns 404 across tenants', async () => {
      const b1 = Array.from(store.values()).find((r) => r.tenantId === 'tenant-b')!;
      await expect(service.findOne('tenant-a', b1.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update / remove', () => {
    it('update refuses cross-tenant', async () => {
      const ac = await service.create('tenant-a', { name: 'X', businessName: 'X' } as any);
      await expect(
        service.update('tenant-b', ac.id, { status: 'active' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove refuses cross-tenant', async () => {
      const ac = await service.create('tenant-a', { name: 'X', businessName: 'X' } as any);
      await expect(service.remove('tenant-b', ac.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
