import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import { CrmContractStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';
import { CrmContractsService } from '../crm/contracts/crm-contracts.service';
import { CrmActor } from '../crm/common/actor';
import { ClicksignClient } from './clicksign.client';
import { CreateSignatureEnvelopeDto } from './dto/signatures.dto';

const PROVIDER_KEY = 'clicksign';

interface ClicksignWebhookPayload {
  event?: {
    name?: string;
    data?: {
      document?: { key?: string };
      signer?: { key?: string; email?: string; sign_as?: string };
      occurred_at?: string;
    };
  };
  document?: { key?: string };
}

@Injectable()
export class CrmSignaturesService {
  private readonly logger = new Logger(CrmSignaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: BridgeSecretCipher,
    private readonly clicksign: ClicksignClient,
    private readonly contracts: CrmContractsService,
    private readonly systemEvents: SystemEventsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Authenticated API (called from controllers)
  // ---------------------------------------------------------------------------

  async createEnvelope(
    tenantId: string,
    contractId: string,
    dto: CreateSignatureEnvelopeDto,
    actor: CrmActor,
  ) {
    const contract = await this.contracts.findOne(tenantId, contractId, actor);
    if (!contract.pdfUrl) {
      throw new BadRequestException(
        'Contract has no pdfUrl. Upload/generate the contract PDF before requesting signatures.',
      );
    }
    if (contract.status === CrmContractStatus.signed) {
      throw new BadRequestException('Contract is already signed');
    }
    if (contract.externalEnvelopeId) {
      throw new BadRequestException(
        'Contract already has a signature envelope. Cancel/revoke before creating a new one.',
      );
    }

    const roles = new Set<string>();
    for (const s of dto.signers) {
      const role = s.role.trim();
      if (!role) throw new BadRequestException('signer role cannot be empty');
      if (roles.has(role)) {
        throw new BadRequestException(`Duplicate signer role "${role}"`);
      }
      roles.add(role);
    }
    if (roles.size === 0) {
      throw new BadRequestException('At least one signer is required');
    }

    // 1. Cria signature rows local com token único — usado depois para
    //    casar o webhook do provider de volta com nosso registro.
    const signers = dto.signers.map((s) => ({
      ...s,
      signerToken: randomUUID(),
    }));

    // 2. Cria envelope no provider.
    const envelope = await this.clicksign.createEnvelope({
      documentName: `contrato-${contract.id.slice(0, 8)}`,
      documentUrl: contract.pdfUrl,
      signers,
      note: dto.note,
    });

    // 3. Persiste em transação: signatures + contract.externalEnvelope*.
    return this.prisma.$transaction(async (tx) => {
      for (const s of signers) {
        await tx.crmSignature.upsert({
          where: {
            contractId_role: { contractId, role: s.role.trim() },
          },
          create: {
            tenantId,
            contractId,
            role: s.role.trim(),
            signerName: s.name,
            signerEmail: s.email.toLowerCase(),
            token: s.signerToken,
          },
          update: {
            signerName: s.name,
            signerEmail: s.email.toLowerCase(),
            token: s.signerToken,
            status: 'pending',
            signedAt: null,
            signatureHash: null,
            ipAddress: null,
          },
        });
      }
      const updated = await tx.crmContract.update({
        where: { id: contractId },
        data: {
          externalProvider: envelope.provider,
          externalEnvelopeId: envelope.envelopeId,
          externalEnvelopeUrl: envelope.envelopeUrl,
          status: CrmContractStatus.pending_signature,
        },
      });
      await tx.crmContractEvent.create({
        data: {
          tenantId,
          contractId,
          eventType: 'envelope_created',
          fromStatus: contract.status,
          toStatus: CrmContractStatus.pending_signature,
          message: `Envelope ${envelope.envelopeId} on ${envelope.provider}`,
          createdById: actor.id,
        },
      });
      return {
        envelopeId: envelope.envelopeId,
        envelopeUrl: envelope.envelopeUrl,
        provider: envelope.provider,
        contract: updated,
      };
    });
  }

  async listForContract(tenantId: string, contractId: string, actor: CrmActor) {
    // Reusa o scoping do CrmContractsService — broker só vê o que é dele.
    await this.contracts.findOne(tenantId, contractId, actor);
    return this.prisma.crmSignature.findMany({
      where: { tenantId, contractId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        signerName: true,
        signerEmail: true,
        status: true,
        signedAt: true,
        ipAddress: true,
        signatureHash: true,
        createdAt: true,
        updatedAt: true,
        // token deliberadamente omitido — só vive no provider/webhook
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Public webhook (no JWT — auth via HMAC + integration mapping)
  // ---------------------------------------------------------------------------

  async handleWebhook(input: {
    rawBody: Buffer;
    signature: string;
    integrationId?: string; // opcional: header customizado para multi-tenant
  }): Promise<{ accepted: boolean; tenantId: string | null }> {
    if (!input.rawBody || input.rawBody.length === 0) {
      throw new BadRequestException('Missing raw body');
    }
    if (!input.signature || input.signature.trim() === '') {
      throw new UnauthorizedException('Missing signature');
    }

    const payload = this.safeParse(input.rawBody);
    const envelopeId =
      payload.event?.data?.document?.key ?? payload.document?.key;
    if (!envelopeId) {
      throw new BadRequestException('Webhook payload missing document.key');
    }

    // Resolve tenant pelo envelope. CrmContract.externalEnvelopeId é único
    // (em produção, dois envelopes não compartilham id). Cruzamos com o
    // tenantId do row, e dali achamos a IntegrationConnection do tenant.
    const contract = await this.prisma.crmContract.findFirst({
      where: { externalEnvelopeId: envelopeId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!contract) {
      if (process.env.NODE_ENV === 'production') {
        throw new NotFoundException('Envelope not associated with any contract');
      }
      this.logger.warn(
        `[dev] webhook for unknown envelope ${envelopeId}; ignoring`,
      );
      return { accepted: false, tenantId: null };
    }

    const tenantId = contract.tenantId;

    // Em produção, exige HMAC válido contra o secret armazenado na
    // IntegrationConnection do tenant (provider='clicksign'). Em
    // dev/test, libera com warning para facilitar testes manuais.
    if (process.env.NODE_ENV === 'production') {
      const connection = await this.prisma.integrationConnection.findFirst({
        where: {
          tenantId,
          provider: PROVIDER_KEY,
          status: 'active',
          ...(input.integrationId ? { id: input.integrationId } : {}),
        },
      });
      if (!connection) {
        throw new ForbiddenException(
          'No active clicksign IntegrationConnection for this tenant',
        );
      }
      const secret = this.cipher.decryptWithLegacyFallback(
        connection.webhookSecretEncrypted,
      );
      this.verifyClicksignHmac(input.rawBody, input.signature, secret);
    } else {
      this.logger.warn(
        `[dev] clicksign HMAC verification skipped (NODE_ENV=${process.env.NODE_ENV})`,
      );
    }

    // Aplica o evento.
    const evName = (payload.event?.name ?? '').toLowerCase();
    const signerEmail = payload.event?.data?.signer?.email?.toLowerCase();
    const signerRole = payload.event?.data?.signer?.sign_as;
    const occurredAt = payload.event?.data?.occurred_at
      ? new Date(payload.event.data.occurred_at)
      : new Date();

    if (evName.includes('sign')) {
      await this.markSignerSigned(tenantId, contract.id, {
        email: signerEmail ?? null,
        role: signerRole ?? null,
        occurredAt,
      });
    } else if (evName.includes('refuse')) {
      await this.markSignerRefused(tenantId, contract.id, {
        email: signerEmail ?? null,
        role: signerRole ?? null,
      });
    } else if (
      evName.includes('finish') ||
      evName.includes('complete') ||
      evName.includes('signed_all') ||
      evName.includes('close')
    ) {
      await this.contracts.markSignedInternal(tenantId, contract.id);
    } else {
      this.logger.log(`Ignoring clicksign event "${evName}"`);
    }

    // Audit. SystemEvent é canônico para "esse provider mandou algo".
    await this.systemEvents.logEvent(
      EventType.CRM_SIGNATURE_WEBHOOK_RECEIVED,
      EventModule.CRM_SIGNATURES,
      {
        provider: PROVIDER_KEY,
        contractId: contract.id,
        eventName: evName || 'unknown',
        envelopeId,
      },
      undefined,
      EventSeverity.INFO,
      tenantId,
    );

    return { accepted: true, tenantId };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** Clicksign assina o webhook com HMAC-SHA256 hex; header é "secret=<hex>" OU só hex. */
  private verifyClicksignHmac(rawBody: Buffer, signature: string, secret: string) {
    const cleaned = signature.replace(/^secret=/i, '').replace(/^sha256=/i, '').trim();
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const sigBuf = Buffer.from(cleaned, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid signature');
    }
  }

  private safeParse(rawBody: Buffer): ClicksignWebhookPayload {
    try {
      return JSON.parse(rawBody.toString('utf8')) as ClicksignWebhookPayload;
    } catch {
      return {};
    }
  }

  private async markSignerSigned(
    tenantId: string,
    contractId: string,
    info: { email: string | null; role: string | null; occurredAt: Date },
  ) {
    const where: Prisma.CrmSignatureWhereInput = { tenantId, contractId };
    if (info.role) where.role = info.role;
    else if (info.email) where.signerEmail = info.email;

    const row = await this.prisma.crmSignature.findFirst({ where });
    if (!row) {
      this.logger.warn(
        `clicksign signer not found for contract ${contractId} (role=${info.role}, email=${info.email})`,
      );
      return;
    }
    await this.prisma.crmSignature.update({
      where: { id: row.id },
      data: {
        status: 'signed',
        signedAt: info.occurredAt,
      },
    });
    // Sincroniza snapshot JSONB do contract (app-layer signatures-sync).
    await this.syncSignaturesSnapshot(tenantId, contractId);
  }

  private async markSignerRefused(
    tenantId: string,
    contractId: string,
    info: { email: string | null; role: string | null },
  ) {
    const where: Prisma.CrmSignatureWhereInput = { tenantId, contractId };
    if (info.role) where.role = info.role;
    else if (info.email) where.signerEmail = info.email;

    const row = await this.prisma.crmSignature.findFirst({ where });
    if (!row) return;
    await this.prisma.crmSignature.update({
      where: { id: row.id },
      data: { status: 'refused' },
    });
    await this.syncSignaturesSnapshot(tenantId, contractId);
  }

  private async syncSignaturesSnapshot(tenantId: string, contractId: string) {
    const rows = await this.prisma.crmSignature.findMany({
      where: { tenantId, contractId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        signerName: true,
        signerEmail: true,
        status: true,
        signedAt: true,
      },
    });
    await this.prisma.crmContract.update({
      where: { id: contractId },
      data: { signatures: rows as unknown as Prisma.InputJsonValue },
    });
  }
}
