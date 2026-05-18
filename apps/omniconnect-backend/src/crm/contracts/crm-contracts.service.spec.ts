import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CrmContractStatus,
  CrmProposalStatus,
  CrmUnitStatus,
  Role,
} from '@prisma/client';
import { CrmContractsService } from './crm-contracts.service';
import { PrismaService } from '../../prisma.service';
import { CrmRealtimeService } from '../../crm-realtime/crm-realtime.service';

/**
 * Tenant + broker + signed-contract immutability for CrmContractsService.
 * Cobre:
 *  - cross-tenant 404 em findOne/update/transition/remove
 *  - broker scope (broker só vê seus contratos)
 *  - signed contract é imutável (transition/update/remove falham)
 *  - markSignedInternal emite realtime + lê payments/commissions geradas
 *    pelo trigger SQL para emitir crm.payment.created e
 *    crm.commission.created (+ broker scope)
 */
describe('CrmContractsService — tenant + broker + signed immutability', () => {
  let service: CrmContractsService;
  let prismaMock: any;
  let realtimeMock: any;

  beforeEach(async () => {
    const contracts = new Map<string, any>([
      [
        'ct-a',
        {
          id: 'ct-a',
          tenantId: 'tenant-a',
          unitId: 'unit-a',
          brokerId: 10,
          status: CrmContractStatus.draft,
          pdfUrl: 'https://example.test/contract-a.pdf',
        },
      ],
      [
        'ct-b',
        {
          id: 'ct-b',
          tenantId: 'tenant-b',
          unitId: 'unit-b',
          brokerId: 99,
          status: CrmContractStatus.draft,
          pdfUrl: 'https://example.test/contract-b.pdf',
        },
      ],
      [
        'ct-signed',
        {
          id: 'ct-signed',
          tenantId: 'tenant-a',
          unitId: 'unit-a',
          brokerId: 10,
          status: CrmContractStatus.signed,
          pdfUrl: 'https://example.test/signed.pdf',
        },
      ],
    ]);
    const events: any[] = [];
    const payments = [
      {
        id: 'pay-1',
        contractId: 'ct-a',
        type: 'down_payment',
        amount: 50000,
        dueDate: new Date(),
      },
    ];
    const commissions = [
      {
        id: 'com-1',
        contractId: 'ct-a',
        brokerId: 10,
        commissionValue: 12500,
        status: 'pending',
      },
    ];

    prismaMock = {
      crmContract: {
        findFirst: jest.fn(async ({ where }: any) => {
          for (const c of contracts.values()) {
            if (where.id && c.id !== where.id) continue;
            if (where.tenantId && c.tenantId !== where.tenantId) continue;
            if (where.brokerId !== undefined && c.brokerId !== where.brokerId)
              continue;
            return { ...c, events: [], signaturesList: [] };
          }
          return null;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = contracts.get(where.id);
          Object.assign(row!, data);
          return row;
        }),
        delete: jest.fn(async ({ where }: any) => contracts.delete(where.id)),
        findMany: jest.fn(async () => []),
      },
      crmContractEvent: {
        create: jest.fn(async ({ data }: any) => {
          events.push(data);
          return data;
        }),
      },
      crmUnit: { updateMany: jest.fn(async () => ({ count: 1 })) },
      crmPayment: {
        findMany: jest.fn(async () => payments),
      },
      crmCommission: {
        findMany: jest.fn(async () => commissions),
      },
      $transaction: jest.fn(async (cb: any) => cb(prismaMock)),
    };

    realtimeMock = { emitToTenant: jest.fn(), emitToBroker: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CrmContractsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CrmRealtimeService, useValue: realtimeMock },
      ],
    }).compile();
    service = moduleRef.get(CrmContractsService);
  });

  it('findOne: cross-tenant returns NotFound', async () => {
    await expect(
      service.findOne('tenant-a', 'ct-b', {
        id: 1,
        role: Role.admin,
        tenantRole: Role.admin,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOne: broker only sees its own contracts inside the tenant', async () => {
    await expect(
      service.findOne('tenant-a', 'ct-a', {
        id: 999,
        role: Role.broker,
        tenantRole: Role.broker,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const ok = await service.findOne('tenant-a', 'ct-a', {
      id: 10,
      role: Role.broker,
      tenantRole: Role.broker,
    });
    expect(ok.id).toBe('ct-a');
  });

  it('update: signed contract is immutable', async () => {
    await expect(
      service.update(
        'tenant-a',
        'ct-signed',
        { notes: 'try edit' },
        { id: 1, role: Role.admin, tenantRole: Role.admin },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('transition: signed status cannot be set directly via the API', async () => {
    await expect(
      service.transition(
        'tenant-a',
        'ct-a',
        { status: CrmContractStatus.signed },
        { id: 1, role: Role.admin, tenantRole: Role.admin },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove: signed contract cannot be deleted', async () => {
    await expect(
      service.remove('tenant-a', 'ct-signed', {
        id: 1,
        role: Role.admin,
        tenantRole: Role.admin,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('markSignedInternal: emits payment + commission events post-trigger', async () => {
    await service.markSignedInternal('tenant-a', 'ct-a');
    const tenantEvents = realtimeMock.emitToTenant.mock.calls.map(
      (c: any[]) => c[1],
    );
    expect(tenantEvents).toContain('crm.contract.signed');
    expect(tenantEvents).toContain('crm.payment.created');
    expect(tenantEvents).toContain('crm.commission.created');
    expect(realtimeMock.emitToBroker).toHaveBeenCalledWith(
      'tenant-a',
      10,
      'crm.commission.created.self',
      expect.any(Object),
    );
  });

  it('markSignedInternal: is idempotent', async () => {
    await service.markSignedInternal('tenant-a', 'ct-signed');
    // Não deveria emitir (já está signed).
    expect(realtimeMock.emitToTenant).not.toHaveBeenCalled();
  });
});
