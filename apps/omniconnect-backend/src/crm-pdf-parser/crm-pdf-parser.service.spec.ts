import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CrmDocumentParentType } from '@prisma/client';
import { CrmPdfParserService } from './crm-pdf-parser.service';
import { PrismaService } from '../prisma.service';
import { ModelPricingService } from '../model-pricing/model-pricing.service';

describe('CrmPdfParserService', () => {
  let service: CrmPdfParserService;
  let prismaMock: any;
  let configMock: any;
  let pricingMock: any;
  let usageLogs: any[];

  beforeEach(async () => {
    usageLogs = [];
    prismaMock = {
      aIUsageLog: { create: jest.fn(async ({ data }: any) => { usageLogs.push(data); return data; }) },
    };
    configMock = { get: jest.fn((k: string) => undefined as any) };
    pricingMock = {
      estimateCost: jest.fn(async () => ({
        cost: 0.0001,
        pricing: { currency: 'USD' },
      })),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CrmPdfParserService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: ModelPricingService, useValue: pricingMock },
      ],
    }).compile();
    service = moduleRef.get(CrmPdfParserService);
  });

  it('rejects when text is too short', async () => {
    await expect(
      service.parse('t-a', {
        kind: CrmDocumentParentType.proposal,
        text: 'short',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns empty result in dev when OPENAI_API_KEY is missing', async () => {
    configMock.get.mockReturnValue(undefined);
    const result = await service.parse('t-a', {
      kind: CrmDocumentParentType.proposal,
      text: 'Proposta de venda do imóvel teste com cliente fictício',
    });
    expect(result.propertyName).toBeNull();
    expect(result.paymentCondition).toBeNull();
  });

  it('throws ServiceUnavailable in production when key is missing', async () => {
    const prev = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
    try {
      await expect(
        service.parse('t-a', {
          kind: CrmDocumentParentType.proposal,
          text: 'Proposta de venda do imóvel teste com cliente fictício',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: prev,
        configurable: true,
      });
    }
  });

  it('parses OpenAI response and logs AIUsageLog', async () => {
    configMock.get.mockImplementation((k: string) =>
      k === 'OPENAI_API_KEY' ? 'sk-test' : k === 'OPENAI_MODEL' ? 'gpt-4o-mini' : undefined,
    );
    const fakeJson = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              propertyName: 'Edifício Sol',
              unitNumber: '402',
              clientName: 'João da Silva',
              clientCpfCnpj: '123.456.789-00',
              brokerName: 'Maria Corretora',
              finalPrice: 450000,
              paymentCondition: {
                downPayment: 50000,
                installments: [
                  { amount: 20000, dueDate: '2026-06-10', type: 'signal' },
                  { amount: 20000, dueDate: '2026-07-10', type: 'installment' },
                ],
              },
              notes: 'Entrega em dezembro',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 1234, completion_tokens: 432 },
    };
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch' as any)
      .mockResolvedValue({
        ok: true,
        json: async () => fakeJson,
        text: async () => JSON.stringify(fakeJson),
      } as any);
    try {
      const result = await service.parse('tenant-a', {
        kind: CrmDocumentParentType.proposal,
        text: 'Proposta detalhada para a unidade 402 do Edifício Sol...',
      });
      expect(result.propertyName).toBe('Edifício Sol');
      expect(result.finalPrice).toBe(450000);
      expect(result.paymentCondition?.installments).toHaveLength(2);
      expect(usageLogs[0]).toMatchObject({
        tenantId: 'tenant-a',
        operationType: 'crm_pdf_parse',
        modelProvider: 'openai',
        status: 'success',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('logs AIUsageLog failure and throws on OpenAI error', async () => {
    configMock.get.mockImplementation((k: string) =>
      k === 'OPENAI_API_KEY' ? 'sk-test' : k === 'OPENAI_MODEL' ? 'gpt-4o-mini' : undefined,
    );
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch' as any)
      .mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'Internal server error',
      } as any);
    try {
      await expect(
        service.parse('tenant-a', {
          kind: CrmDocumentParentType.contract,
          text: 'Contrato de compra e venda com cláusulas detalhadas...',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      const failureLog = usageLogs.find((l) => l.status === 'failure');
      expect(failureLog).toBeDefined();
      expect(failureLog.tenantId).toBe('tenant-a');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
