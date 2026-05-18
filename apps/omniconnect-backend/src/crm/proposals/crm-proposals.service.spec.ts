import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CrmContractStatus, CrmProposalStatus, CrmUnitStatus, Role } from '@prisma/client';
import { CrmProposalsService } from './crm-proposals.service';
import { PrismaService } from '../../prisma.service';

/**
 * Smoke test do CrmProposalsService cobrindo:
 *  - tenant isolation
 *  - escopo do broker (broker só vê suas propostas)
 *  - eventos auto-criados em create/transition
 */
describe('CrmProposalsService — tenant + broker isolation', () => {
  let service: CrmProposalsService;
  let prismaMock: any;

  beforeEach(async () => {
    const proposals = new Map<string, any>();
    const events: any[] = [];
    const properties = new Map<string, any>([
      [
        'prop-a',
        { id: 'prop-a', tenantId: 'tenant-a', name: 'Alpha' },
      ],
    ]);
    const units = new Map<string, any>([
      [
        'unit-a',
        {
          id: 'unit-a',
          tenantId: 'tenant-a',
          propertyId: 'prop-a',
          number: '101',
          status: CrmUnitStatus.available,
        },
      ],
    ]);
    const clients = new Map<string, any>([
      ['client-a', { id: 'client-a', tenantId: 'tenant-a', name: 'Cliente A' }],
    ]);
    const users = new Map<number, any>([
      [10, { id: 10, name: 'Broker A' }],
      [20, { id: 20, name: 'Broker B' }],
    ]);
    let nextId = 1;

    prismaMock = {
      crmProperty: {
        findFirst: jest.fn(async ({ where }: any) => {
          const row = properties.get(where.id);
          if (!row || row.tenantId !== where.tenantId) return null;
          return row;
        }),
      },
      crmUnit: {
        findFirst: jest.fn(async ({ where }: any) => {
          const row = units.get(where.id);
          if (!row || row.tenantId !== where.tenantId) return null;
          if (where.propertyId && row.propertyId !== where.propertyId) return null;
          return row;
        }),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      crmClient: {
        findFirst: jest.fn(async ({ where }: any) => {
          const row = clients.get(where.id);
          if (!row || row.tenantId !== where.tenantId) return null;
          return row;
        }),
      },
      user: {
        findUnique: jest.fn(async ({ where }: any) =>
          users.get(where.id) ?? null,
        ),
      },
      crmProposal: {
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: `prop-${nextId++}`,
            status: CrmProposalStatus.draft,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          proposals.set(row.id, row);
          return row;
        }),
        findMany: jest.fn(async ({ where }: any) =>
          Array.from(proposals.values()).filter((r) => {
            if (where.tenantId && r.tenantId !== where.tenantId) return false;
            if (where.brokerId !== undefined && r.brokerId !== where.brokerId)
              return false;
            if (where.status && r.status !== where.status) return false;
            return true;
          }),
        ),
        findFirst: jest.fn(async ({ where }: any) => {
          for (const r of proposals.values()) {
            if (where.id && r.id !== where.id) continue;
            if (where.tenantId && r.tenantId !== where.tenantId) continue;
            if (where.brokerId !== undefined && r.brokerId !== where.brokerId)
              continue;
            return { ...r, events: [] };
          }
          return null;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = proposals.get(where.id);
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        }),
        delete: jest.fn(async ({ where }: any) => {
          proposals.delete(where.id);
        }),
      },
      crmProposalEvent: {
        create: jest.fn(async ({ data }: any) => {
          const ev = { id: `ev-${nextId++}`, ...data, createdAt: new Date() };
          events.push(ev);
          return ev;
        }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prismaMock)),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CrmProposalsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(CrmProposalsService);
  });

  it('admin can create proposal for any broker; emits created event', async () => {
    const proposal = await service.create(
      'tenant-a',
      {
        propertyId: 'prop-a',
        unitId: 'unit-a',
        clientId: 'client-a',
        brokerId: 10,
        finalPrice: 250000,
      },
      { id: 1, role: Role.admin, tenantRole: Role.admin },
    );
    expect(proposal.tenantId).toBe('tenant-a');
    expect(proposal.brokerId).toBe(10);
    expect(prismaMock.crmProposalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'created',
          toStatus: CrmProposalStatus.draft,
        }),
      }),
    );
  });

  it('broker is auto-assigned and cannot set brokerId to someone else', async () => {
    const proposal = await service.create(
      'tenant-a',
      {
        propertyId: 'prop-a',
        unitId: 'unit-a',
        clientId: 'client-a',
        brokerId: 20, // tentativa de "spoofing"
      },
      { id: 10, role: Role.broker, tenantRole: Role.broker },
    );
    expect(proposal.brokerId).toBe(10);
  });

  it('broker B cannot fetch broker A proposal (tenant-aware broker scope)', async () => {
    const proposal = await service.create(
      'tenant-a',
      {
        propertyId: 'prop-a',
        unitId: 'unit-a',
        clientId: 'client-a',
      },
      { id: 10, role: Role.broker, tenantRole: Role.broker },
    );
    await expect(
      service.findOne('tenant-a', proposal.id, {
        id: 20,
        role: Role.broker,
        tenantRole: Role.broker,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cannot fetch proposals across tenants', async () => {
    const proposal = await service.create(
      'tenant-a',
      {
        propertyId: 'prop-a',
        unitId: 'unit-a',
        clientId: 'client-a',
        brokerId: 10,
      },
      { id: 1, role: Role.admin, tenantRole: Role.admin },
    );
    await expect(
      service.findOne('tenant-b', proposal.id, {
        id: 1,
        role: Role.admin,
        tenantRole: Role.admin,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks invalid status transition draft -> accepted', async () => {
    const proposal = await service.create(
      'tenant-a',
      {
        propertyId: 'prop-a',
        unitId: 'unit-a',
        clientId: 'client-a',
        brokerId: 10,
      },
      { id: 1, role: Role.admin, tenantRole: Role.admin },
    );
    await expect(
      service.transition(
        'tenant-a',
        proposal.id,
        { status: CrmProposalStatus.accepted },
        { id: 1, role: Role.admin, tenantRole: Role.admin },
      ),
    ).rejects.toThrow(/Cannot transition/);
  });
});
