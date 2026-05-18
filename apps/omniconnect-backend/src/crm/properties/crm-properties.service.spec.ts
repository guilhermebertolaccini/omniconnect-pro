import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CrmPropertiesService } from './crm-properties.service';
import { PrismaService } from '../../prisma.service';

interface PropertyRow {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  city: string;
  developer: string | null;
  imageUrl: string | null;
  towers: unknown[];
  documents: unknown[];
  createdById: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CommissionRow {
  id: string;
  tenantId: string;
  propertyId: string;
  commissionPercent: number;
  updatedById: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tenant isolation invariants for CrmPropertiesService.
 * Verifica que findOne/update/remove cruzados entre tenants levantam
 * NotFoundException — nunca devolvem dado de outro tenant.
 */
describe('CrmPropertiesService — tenant isolation', () => {
  let service: CrmPropertiesService;
  let prismaMock: any;
  let properties: Map<string, PropertyRow>;
  let configs: Map<string, CommissionRow>;
  let nextId = 1;

  beforeEach(async () => {
    properties = new Map();
    configs = new Map();
    nextId = 1;
    prismaMock = {
      crmProperty: {
        create: jest.fn(async ({ data }: any) => {
          const row: PropertyRow = {
            id: `p-${nextId++}`,
            tenantId: data.tenantId,
            name: data.name,
            address: data.address,
            city: data.city,
            developer: data.developer ?? null,
            imageUrl: data.imageUrl ?? null,
            towers: data.towers ?? [],
            documents: data.documents ?? [],
            createdById: data.createdById ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          properties.set(row.id, row);
          return row;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          for (const r of properties.values()) {
            if (where.id && r.id !== where.id) continue;
            if (where.tenantId && r.tenantId !== where.tenantId) continue;
            return r;
          }
          return null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          return Array.from(properties.values()).filter(
            (r) => r.tenantId === where.tenantId,
          );
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = properties.get(where.id);
          if (!row) throw new Error('not found');
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        }),
        delete: jest.fn(async ({ where }: any) => {
          const row = properties.get(where.id);
          if (!row) throw new Error('not found');
          properties.delete(where.id);
          return row;
        }),
      },
      crmCommissionConfig: {
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const existing = configs.get(where.propertyId);
          if (existing) {
            Object.assign(existing, update, { updatedAt: new Date() });
            return existing;
          }
          const row: CommissionRow = {
            id: `cc-${nextId++}`,
            tenantId: create.tenantId,
            propertyId: create.propertyId,
            commissionPercent: create.commissionPercent,
            updatedById: create.updatedById ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          configs.set(row.propertyId, row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }: any) =>
          configs.get(where.propertyId) ?? null,
        ),
      },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CrmPropertiesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(CrmPropertiesService);
  });

  it('creates property scoped to the caller tenant', async () => {
    const p = await service.create('tenant-a', {
      name: 'Empreendimento Alpha',
      address: 'Rua A, 1',
      city: 'São Paulo',
    });
    expect(p.tenantId).toBe('tenant-a');
  });

  it('findOne of another tenant raises NotFound', async () => {
    const a = await service.create('tenant-a', {
      name: 'A',
      address: 'x',
      city: 'sp',
    });
    await expect(service.findOne('tenant-b', a.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findAll only returns rows of the caller tenant', async () => {
    await service.create('tenant-a', { name: 'A', address: 'x', city: 'sp' });
    await service.create('tenant-b', { name: 'B', address: 'x', city: 'sp' });
    const rowsA = await service.findAll('tenant-a');
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].tenantId).toBe('tenant-a');
  });

  it('update across tenants raises NotFound', async () => {
    const a = await service.create('tenant-a', {
      name: 'A',
      address: 'x',
      city: 'sp',
    });
    await expect(
      service.update('tenant-b', a.id, { name: 'hacked' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove across tenants raises NotFound', async () => {
    const a = await service.create('tenant-a', {
      name: 'A',
      address: 'x',
      city: 'sp',
    });
    await expect(service.remove('tenant-b', a.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('commission config upsert is tenant-scoped', async () => {
    const a = await service.create('tenant-a', {
      name: 'A',
      address: 'x',
      city: 'sp',
    });
    const cfg = await service.setCommissionConfig(
      'tenant-a',
      a.id,
      { commissionPercent: 7 },
      99,
    );
    expect(cfg.tenantId).toBe('tenant-a');
    expect(Number(cfg.commissionPercent)).toBe(7);
    await expect(
      service.setCommissionConfig(
        'tenant-b',
        a.id,
        { commissionPercent: 12 },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
