import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrmDocumentParentType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ModelPricingService } from '../model-pricing/model-pricing.service';
import { ParseCrmDocumentDto } from './dto/parse.dto';

export interface ParsedProposal {
  propertyName: string | null;
  unitNumber: string | null;
  clientName: string | null;
  clientCpfCnpj: string | null;
  brokerName: string | null;
  finalPrice: number | null;
  paymentCondition: {
    downPayment: number | null;
    installments: Array<{
      amount: number | null;
      dueDate: string | null;
      type: 'signal' | 'installment' | 'balloon';
    }>;
  } | null;
  notes: string | null;
}

export interface ParsedContract extends ParsedProposal {}

const PROMPT_VERSION = 'crm-pdf-parser/v1';

const SYSTEM_PROMPT =
  'Você é um extrator de dados de documentos imobiliários brasileiros (propostas e contratos). ' +
  'Devolva APENAS JSON válido seguindo o schema fornecido — sem texto antes ou depois. ' +
  'Use null em campos não encontrados. Valores monetários em BRL como números (não strings). ' +
  'Datas em ISO-8601 (YYYY-MM-DD).';

function buildUserPrompt(kind: CrmDocumentParentType, text: string): string {
  return [
    `# Tipo do documento\n${kind === CrmDocumentParentType.contract ? 'Contrato' : 'Proposta'}`,
    '',
    '# Schema esperado',
    '{',
    '  "propertyName": string|null,',
    '  "unitNumber": string|null,',
    '  "clientName": string|null,',
    '  "clientCpfCnpj": string|null,',
    '  "brokerName": string|null,',
    '  "finalPrice": number|null,',
    '  "paymentCondition": {',
    '    "downPayment": number|null,',
    '    "installments": [{ "amount": number|null, "dueDate": string|null, "type": "signal"|"installment"|"balloon" }]',
    '  }|null,',
    '  "notes": string|null',
    '}',
    '',
    '# Texto extraído do PDF',
    text.slice(0, 50_000),
  ].join('\n');
}

/**
 * Parser AI-driven de PDFs de propostas/contratos. Recebe texto bruto
 * (já extraído no frontend via pdf.js) e devolve JSON estruturado para
 * preencher CrmProposal/CrmContract.
 *
 * Não armazena o texto bruto; loga apenas tokens consumidos via
 * AIUsageLog com operationType='crm_pdf_parse'.
 */
@Injectable()
export class CrmPdfParserService {
  private readonly logger = new Logger(CrmPdfParserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly pricing: ModelPricingService,
  ) {}

  async parse(tenantId: string, dto: ParseCrmDocumentDto): Promise<ParsedProposal> {
    if (!dto.text || dto.text.trim().length < 10) {
      throw new BadRequestException('text is too short to extract anything');
    }
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'OPENAI_API_KEY not configured — pdf parsing unavailable',
        );
      }
      this.logger.warn(
        `[dev] OPENAI_API_KEY missing; returning heuristic empty parse for tenant ${tenantId}`,
      );
      return this.emptyResult();
    }

    const model = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(dto.kind, dto.text) },
          ],
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI HTTP ${response.status}: ${body.slice(0, 500)}`);
      }
      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content;
      const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
      if (!content) {
        throw new Error('Empty content from OpenAI');
      }
      const parsed = this.normalize(JSON.parse(content));

      const { cost, pricing } = await this.pricing.estimateCost(
        'openai',
        model,
        usage.prompt_tokens,
        usage.completion_tokens,
      );
      await this.prisma.aIUsageLog
        .create({
          data: {
            tenantId,
            operationType: 'crm_pdf_parse',
            modelProvider: 'openai',
            modelName: model,
            promptVersion: PROMPT_VERSION,
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            estimatedCost: cost,
            currency: pricing.currency,
            status: 'success',
          },
        })
        .catch((err) =>
          this.logger.error(
            `Failed to save AIUsageLog: ${(err as Error)?.message}`,
          ),
        );

      return parsed;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`crm-pdf-parser failed: ${err.message}`);
      await this.prisma.aIUsageLog
        .create({
          data: {
            tenantId,
            operationType: 'crm_pdf_parse',
            modelProvider: 'openai',
            modelName: model,
            promptVersion: PROMPT_VERSION,
            promptTokens: 0,
            completionTokens: 0,
            estimatedCost: 0,
            currency: 'USD',
            status: 'failure',
            errorMessage: err.message.slice(0, 1000),
          },
        })
        .catch((e) =>
          this.logger.error(
            `Failed to save AIUsageLog failure: ${(e as Error)?.message}`,
          ),
        );
      throw new ServiceUnavailableException(
        `pdf parser unavailable: ${err.message.slice(0, 200)}`,
      );
    }
  }

  private normalize(raw: any): ParsedProposal {
    const ensureNumberOrNull = (v: unknown) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const ensureStringOrNull = (v: unknown) =>
      typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
    const installments = Array.isArray(raw?.paymentCondition?.installments)
      ? raw.paymentCondition.installments.map((i: any) => {
          const type = ['signal', 'installment', 'balloon'].includes(i?.type)
            ? i.type
            : 'installment';
          return {
            amount: ensureNumberOrNull(i?.amount),
            dueDate: ensureStringOrNull(i?.dueDate),
            type: type as 'signal' | 'installment' | 'balloon',
          };
        })
      : [];
    return {
      propertyName: ensureStringOrNull(raw?.propertyName),
      unitNumber: ensureStringOrNull(raw?.unitNumber),
      clientName: ensureStringOrNull(raw?.clientName),
      clientCpfCnpj: ensureStringOrNull(raw?.clientCpfCnpj),
      brokerName: ensureStringOrNull(raw?.brokerName),
      finalPrice: ensureNumberOrNull(raw?.finalPrice),
      paymentCondition:
        raw?.paymentCondition === null
          ? null
          : {
              downPayment: ensureNumberOrNull(raw?.paymentCondition?.downPayment),
              installments,
            },
      notes: ensureStringOrNull(raw?.notes),
    };
  }

  private emptyResult(): ParsedProposal {
    return {
      propertyName: null,
      unitNumber: null,
      clientName: null,
      clientCpfCnpj: null,
      brokerName: null,
      finalPrice: null,
      paymentCondition: null,
      notes: null,
    };
  }
}
