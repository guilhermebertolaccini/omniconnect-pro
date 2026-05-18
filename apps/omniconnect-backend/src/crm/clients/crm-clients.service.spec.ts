import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CrmClientsService } from './crm-clients.service';
import { PrismaService } from '../../prisma.service';

/**
 * Cobre os contratos de segurança mais sensíveis do `CrmClientsService`:
 *   - PII (CPF/email/phone) mascarada na listagem
 *   - Tenant isolation (admin de tenant A não enxerga clientes do tenant B)
 *   - Broker isolation (broker só enxerga clientes dele dentro do tenant)
 */
describe('CrmClientsService — PII + tenant + broker', () => {
  let service: CrmClientsService;
  let prismaMock: any;

  beforeEach(async () => {
    const rows = [
      {
        id: 'cli-1',
        tenantId: 'tenant-a',
        name: 'Cliente A',
        cpfCnpj: '123.456.789-09',
        phone: '+55 11 99999-0001',
        email: 'cliente.a@example.com',
        income: 12000,
        score: 'A',
        notes: null,
        brokerId: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'cli-2',
        tenantId: 'tenant-a',
        name: 'Cliente B',
        cpfCnpj: null,
        phone: null,
        email: null,
        income: null,
        score: null,
        notes: null,
        brokerId: 20,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'cli-3',
        tenantId: 'tenant-b',
        name: 'Outro Tenant',
        cpfCnpj: '987.654.321-00',
        phone: '+55 21 91111-2222',
        email: 'x@y.com',
        income: 8000,
        score: 'B',
        notes: null,
        brokerId: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    prismaMock = {
      crmClient: {
        findMany: jest.fn(async ({ where }: any) =>
          rows.filter((r) => {
            if (where.tenantId && r.tenantId !== where.tenantId) return false;
            if (where.brokerId !== undefined && r.brokerId !== where.brokerId)
              return false;
            return true;
          }),
        ),
        findFirst: jest.fn(async ({ where }: any) =>
          rows.find(
            (r) =>
              r.id === where.id &&
              (where.tenantId === undefined || r.tenantId === where.tenantId),
          ) ?? null,
        ),
        update: jest.fn(async ({ where, data }: any) => {
          const row = rows.find((r) => r.id === where.id);
          Object.assign(row!, data);
          return row;
        }),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CrmClientsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(CrmClientsService);
  });

  it('findAll masks CPF/email/phone in the list view', async () => {
    const list = await service.findAll('tenant-a', {});
    const a = list.find((c) => c.id === 'cli-1');
    expect(a?.name).toBe('Cliente A');
    expect(a?.cpfCnpj).not.toBe('123.456.789-09');
    expect(a?.cpfCnpj).toMatch(/^\*\*\*\d{3}$/);
    expect(a?.email).not.toBe('cliente.a@example.com');
    expect(a?.email).toContain('@example.com');
    expect(a?.phone).not.toBe('+55 11 99999-0001');
    // income/notes nunca aparecem
    expect((a as any).income).toBeUndefined();
    expect((a as any).notes).toBeUndefined();
  });

  it('findAll does NOT leak clients from other tenants', async () => {
    const list = await service.findAll('tenant-a', {});
    expect(list.find((c) => c.id === 'cli-3')).toBeUndefined();
    expect(list.find((c) => c.id === 'cli-1')).toBeDefined();
  });

  it('findOne returns NotFound for cross-tenant access', async () => {
    await expect(
      service.findOne('tenant-a', 'cli-3', {
        id: 1,
        role: Role.admin,
        tenantRole: Role.admin,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOne returns NotFound when a broker tries to fetch another broker\'s client', async () => {
    // cli-1 belongs to brokerId=10. Broker 20 should not see it.
    await expect(
      service.findOne('tenant-a', 'cli-1', {
        id: 20,
        role: Role.broker,
        tenantRole: Role.broker,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOne succeeds when the broker is the owner', async () => {
    const row = await service.findOne('tenant-a', 'cli-1', {
      id: 10,
      role: Role.broker,
      tenantRole: Role.broker,
    });
    expect(row.id).toBe('cli-1');
  });

  it('findOne returns full PII for admin/supervisor (detail view)', async () => {
    const row = await service.findOne('tenant-a', 'cli-1', {
      id: 1,
      role: Role.admin,
      tenantRole: Role.admin,
    });
    expect(row.cpfCnpj).toBe('123.456.789-09');
    expect(row.email).toBe('cliente.a@example.com');
  });
});
