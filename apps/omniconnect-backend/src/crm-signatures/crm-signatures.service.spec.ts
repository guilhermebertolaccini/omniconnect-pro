import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { CrmContractStatus, Role } from '@prisma/client';
import { CrmSignaturesService } from './crm-signatures.service';
import { ClicksignClient } from './clicksign.client';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { CrmContractsService } from '../crm/contracts/crm-contracts.service';
import {
  SystemEventsService,
} from '../system-events/system-events.service';

describe('CrmSignaturesService', () => {
  let service: CrmSignaturesService;
  let prismaMock: any;
  let cipherMock: any;
  let clicksignMock: any;
  let contractsMock: any;
  let systemEventsMock: any;

  beforeEach(async () => {
    const contracts = new Map<string, any>([
      [
        'ct-a',
        {
          id: 'ct-a',
          tenantId: 'tenant-a',
          status: CrmContractStatus.review,
          pdfUrl: 'https://example.test/contract-a.pdf',
          externalEnvelopeId: null,
          unitId: 'unit-a',
        },
      ],
    ]);
    const signatures: any[] = [];
    const contractEvents: any[] = [];
    const integrationConnections = new Map<string, any>([
      [
        'conn-a',
        {
          id: 'conn-a',
          tenantId: 'tenant-a',
          provider: 'clicksign',
          status: 'active',
          webhookSecretEncrypted: 'plain-secret-for-tests',
        },
      ],
    ]);

    prismaMock = {
      crmSignature: {
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const existing = signatures.find(
            (s) =>
              s.contractId === where.contractId_role.contractId &&
              s.role === where.contractId_role.role,
          );
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          const row = {
            id: `sig-${signatures.length + 1}`,
            ...create,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: create.status ?? 'pending',
            signedAt: null,
            signatureHash: null,
            ipAddress: null,
          };
          signatures.push(row);
          return row;
        }),
        findFirst: jest.fn(async ({ where }: any) =>
          signatures.find((s) => {
            if (where.tenantId && s.tenantId !== where.tenantId) return false;
            if (where.contractId && s.contractId !== where.contractId)
              return false;
            if (where.role && s.role !== where.role) return false;
            if (where.signerEmail && s.signerEmail !== where.signerEmail)
              return false;
            return true;
          }) ?? null,
        ),
        findMany: jest.fn(async ({ where }: any) =>
          signatures.filter((s) => {
            if (where.tenantId && s.tenantId !== where.tenantId) return false;
            if (where.contractId && s.contractId !== where.contractId)
              return false;
            return true;
          }),
        ),
        update: jest.fn(async ({ where, data }: any) => {
          const row = signatures.find((s) => s.id === where.id);
          Object.assign(row, data);
          return row;
        }),
      },
      crmContract: {
        findFirst: jest.fn(async ({ where }: any) => {
          for (const c of contracts.values()) {
            if (where.id && c.id !== where.id) continue;
            if (where.tenantId && c.tenantId !== where.tenantId) continue;
            if (
              where.externalEnvelopeId &&
              c.externalEnvelopeId !== where.externalEnvelopeId
            )
              continue;
            return c;
          }
          return null;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = contracts.get(where.id);
          Object.assign(row, data);
          return row;
        }),
      },
      crmContractEvent: {
        create: jest.fn(async ({ data }: any) => {
          contractEvents.push(data);
          return data;
        }),
      },
      integrationConnection: {
        findFirst: jest.fn(async ({ where }: any) => {
          for (const c of integrationConnections.values()) {
            if (c.tenantId !== where.tenantId) continue;
            if (c.provider !== where.provider) continue;
            if (where.status && c.status !== where.status) continue;
            if (where.id && c.id !== where.id) continue;
            return c;
          }
          return null;
        }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prismaMock)),
    };

    cipherMock = {
      decryptWithLegacyFallback: jest.fn((blob: string) => blob),
    };
    clicksignMock = {
      isLive: jest.fn(() => false),
      createEnvelope: jest.fn(async (input: any) => ({
        envelopeId: 'env-1',
        envelopeUrl: 'https://mock.clicksign.local/envelopes/env-1',
        provider: 'mock',
      })),
    };
    contractsMock = {
      findOne: jest.fn(async (tenantId: string, id: string) => {
        const c = contracts.get(id);
        if (!c || c.tenantId !== tenantId) {
          throw new Error('contract not found');
        }
        return { ...c, events: [], signaturesList: [] };
      }),
      markSignedInternal: jest.fn(async () => undefined),
    };
    systemEventsMock = { logEvent: jest.fn(async () => undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CrmSignaturesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: BridgeSecretCipher, useValue: cipherMock },
        { provide: ClicksignClient, useValue: clicksignMock },
        { provide: CrmContractsService, useValue: contractsMock },
        { provide: SystemEventsService, useValue: systemEventsMock },
      ],
    }).compile();
    service = moduleRef.get(CrmSignaturesService);
  });

  it('createEnvelope persists signers, updates contract and emits event', async () => {
    const result = await service.createEnvelope(
      'tenant-a',
      'ct-a',
      {
        signers: [
          { role: 'buyer', name: 'B Buyer', email: 'b@example.com' },
          { role: 'seller', name: 'S Seller', email: 's@example.com' },
        ],
      },
      { id: 1, role: Role.admin, tenantRole: Role.admin },
    );
    expect(result.envelopeId).toBe('env-1');
    expect(prismaMock.crmSignature.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.crmContract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalEnvelopeId: 'env-1',
          status: CrmContractStatus.pending_signature,
        }),
      }),
    );
    expect(prismaMock.crmContractEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'envelope_created' }),
      }),
    );
  });

  it('blocks duplicate roles', async () => {
    await expect(
      service.createEnvelope(
        'tenant-a',
        'ct-a',
        {
          signers: [
            { role: 'buyer', name: 'A', email: 'a@a.com' },
            { role: 'buyer', name: 'B', email: 'b@b.com' },
          ],
        },
        { id: 1, role: Role.admin, tenantRole: Role.admin },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks envelope when contract is already signed', async () => {
    contractsMock.findOne.mockResolvedValueOnce({
      id: 'ct-a',
      tenantId: 'tenant-a',
      status: CrmContractStatus.signed,
      pdfUrl: 'https://x',
    });
    await expect(
      service.createEnvelope(
        'tenant-a',
        'ct-a',
        { signers: [{ role: 'buyer', name: 'X', email: 'x@y.com' }] },
        { id: 1, role: Role.admin, tenantRole: Role.admin },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('webhook', () => {
    beforeEach(async () => {
      // Pré-cria signers via createEnvelope (dev mode = isLive=false).
      await service.createEnvelope(
        'tenant-a',
        'ct-a',
        {
          signers: [
            { role: 'buyer', name: 'B', email: 'b@example.com' },
            { role: 'seller', name: 'S', email: 's@example.com' },
          ],
        },
        { id: 1, role: Role.admin, tenantRole: Role.admin },
      );
    });

    it('accepts sign event and marks signer as signed', async () => {
      const payload = {
        event: {
          name: 'sign',
          data: {
            document: { key: 'env-1' },
            signer: { sign_as: 'buyer', email: 'b@example.com' },
            occurred_at: '2026-05-18T12:00:00Z',
          },
        },
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const res = await service.handleWebhook({
        rawBody,
        signature: 'any-signature-dev-mode',
      });
      expect(res.accepted).toBe(true);
      expect(res.tenantId).toBe('tenant-a');
      expect(prismaMock.crmSignature.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'signed' }),
        }),
      );
    });

    it('rejects when signature header is empty', async () => {
      await expect(
        service.handleWebhook({
          rawBody: Buffer.from('{}'),
          signature: '   ',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('triggers markSignedInternal on close event', async () => {
      const payload = {
        event: {
          name: 'auto_close',
          data: { document: { key: 'env-1' } },
        },
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      await service.handleWebhook({ rawBody, signature: 'dev' });
      expect(contractsMock.markSignedInternal).toHaveBeenCalledWith(
        'tenant-a',
        'ct-a',
      );
    });

    it('validates HMAC in production', async () => {
      const prev = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        configurable: true,
      });
      const secret = 'plain-secret-for-tests';
      const body = Buffer.from('{"event":{"name":"sign","data":{"document":{"key":"env-1"},"signer":{"email":"b@example.com","sign_as":"buyer"}}}}');
      const goodSig = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
      try {
        const ok = await service.handleWebhook({
          rawBody: body,
          signature: goodSig,
        });
        expect(ok.accepted).toBe(true);

        await expect(
          service.handleWebhook({
            rawBody: body,
            signature: 'definitely-wrong-' + 'x'.repeat(50),
          }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      } finally {
        Object.defineProperty(process.env, 'NODE_ENV', {
          value: prev,
          configurable: true,
        });
      }
    });

    it('refuses webhook for unknown envelope in production', async () => {
      const prev = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        configurable: true,
      });
      const body = Buffer.from(
        JSON.stringify({ event: { name: 'sign', data: { document: { key: 'env-NOPE' } } } }),
      );
      const sig = crypto
        .createHmac('sha256', 'plain-secret-for-tests')
        .update(body)
        .digest('hex');
      try {
        await expect(
          service.handleWebhook({ rawBody: body, signature: sig }),
        ).rejects.toThrow(/not associated/);
      } finally {
        Object.defineProperty(process.env, 'NODE_ENV', {
          value: prev,
          configurable: true,
        });
      }
    });
  });
});
