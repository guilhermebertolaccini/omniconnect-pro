import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CrmContractStatus,
  CrmProposalStatus,
  CrmUnitStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CrmActor, effectiveRole } from '../common/actor';
import {
  CreateCrmContractDto,
  TransitionCrmContractDto,
  UpdateCrmContractDto,
} from './dto/contracts.dto';

const STATUS_TRANSITIONS: Record<CrmContractStatus, CrmContractStatus[]> = {
  [CrmContractStatus.draft]: [CrmContractStatus.review],
  [CrmContractStatus.review]: [
    CrmContractStatus.draft,
    CrmContractStatus.pending_signature,
  ],
  [CrmContractStatus.pending_signature]: [
    CrmContractStatus.review,
    CrmContractStatus.signed,
  ],
  [CrmContractStatus.signed]: [],
};

@Injectable()
export class CrmContractsService {
  constructor(private readonly prisma: PrismaService) {}

  private brokerScope(actor: CrmActor): Prisma.CrmContractWhereInput {
    return effectiveRole(actor) === Role.broker
      ? { brokerId: actor.id }
      : {};
  }

  async createFromProposal(
    tenantId: string,
    dto: CreateCrmContractDto,
    actor: CrmActor,
  ) {
    const proposal = await this.prisma.crmProposal.findFirst({
      where: { id: dto.proposalId, tenantId },
      include: { unit: true },
    });
    if (!proposal) {
      throw new NotFoundException('Proposal not found for this tenant');
    }
    if (proposal.status !== CrmProposalStatus.accepted) {
      throw new BadRequestException(
        'Only accepted proposals can be turned into contracts',
      );
    }
    if (
      effectiveRole(actor) === Role.broker &&
      proposal.brokerId !== actor.id
    ) {
      throw new NotFoundException('Proposal not found for this tenant');
    }

    const client = await this.prisma.crmClient.findFirst({
      where: { id: proposal.clientId, tenantId },
      select: { name: true, cpfCnpj: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.crmContract.create({
        data: {
          tenantId,
          proposalId: proposal.id,
          propertyId: proposal.propertyId,
          unitId: proposal.unitId,
          clientId: proposal.clientId,
          brokerId: proposal.brokerId,
          propertyName: proposal.propertyName,
          unitNumber: proposal.unitNumber,
          clientName: client?.name ?? proposal.clientName,
          clientCpfCnpj: client?.cpfCnpj ?? null,
          brokerName: proposal.brokerName,
          finalPrice: proposal.finalPrice,
          paymentCondition: (dto.paymentCondition ??
            (proposal.paymentCondition as Prisma.InputJsonValue)) as Prisma.InputJsonValue,
          notes: dto.notes ?? proposal.notes,
        },
      });
      await tx.crmContractEvent.create({
        data: {
          tenantId,
          contractId: contract.id,
          eventType: 'created',
          toStatus: CrmContractStatus.draft,
          createdById: actor.id,
        },
      });
      return contract;
    });
  }

  async findAll(
    tenantId: string,
    actor: CrmActor,
    status?: CrmContractStatus,
  ) {
    return this.prisma.crmContract.findMany({
      where: {
        tenantId,
        ...this.brokerScope(actor),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string, actor: CrmActor) {
    const row = await this.prisma.crmContract.findFirst({
      where: { id, tenantId, ...this.brokerScope(actor) },
      include: {
        events: { orderBy: { createdAt: 'desc' } },
        signaturesList: true,
      },
    });
    if (!row) throw new NotFoundException('Contract not found for this tenant');
    return row;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCrmContractDto,
    actor: CrmActor,
  ) {
    const existing = await this.findOne(tenantId, id, actor);
    if (existing.status === CrmContractStatus.signed) {
      throw new ForbiddenException('Signed contracts are immutable');
    }
    const data: Prisma.CrmContractUpdateInput = {};
    if (dto.paymentCondition !== undefined)
      data.paymentCondition = dto.paymentCondition as Prisma.InputJsonValue;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.pdfUrl !== undefined) data.pdfUrl = dto.pdfUrl;
    return this.prisma.crmContract.update({ where: { id }, data });
  }

  async transition(
    tenantId: string,
    id: string,
    dto: TransitionCrmContractDto,
    actor: CrmActor,
  ) {
    const existing = await this.findOne(tenantId, id, actor);
    if (existing.status === CrmContractStatus.signed) {
      throw new BadRequestException('Signed contracts cannot transition');
    }
    const allowed = STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition contract from ${existing.status} to ${dto.status}`,
      );
    }
    if (dto.status === CrmContractStatus.signed) {
      // Transição direta para signed via API é restrita ao módulo Signatures.
      throw new ForbiddenException(
        'signed status is only set by the Signatures module after the provider confirms all signatures',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.crmContract.update({
        where: { id },
        data: { status: dto.status },
      });
      await tx.crmContractEvent.create({
        data: {
          tenantId,
          contractId: id,
          eventType: 'status_changed',
          fromStatus: existing.status,
          toStatus: dto.status,
          message: dto.message ?? null,
          createdById: actor.id,
        },
      });
      return updated;
    });
  }

  async remove(tenantId: string, id: string, actor: CrmActor) {
    const existing = await this.findOne(tenantId, id, actor);
    if (existing.status === CrmContractStatus.signed) {
      throw new ForbiddenException('Signed contracts cannot be removed');
    }
    await this.prisma.crmContract.delete({ where: { id } });
    return { id };
  }

  /**
   * Marca contrato como assinado por todos os signers — uso EXCLUSIVO do
   * módulo Signatures (Bloco C). Dispara o trigger SQL on-signed que gera
   * CrmPayment + CrmCommission de forma transacional.
   * Também marca a unit como `sold`.
   */
  async markSignedInternal(
    tenantId: string,
    contractId: string,
  ): Promise<void> {
    const existing = await this.prisma.crmContract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Contract not found for this tenant');
    }
    if (existing.status === CrmContractStatus.signed) {
      return; // idempotente
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.crmContract.update({
        where: { id: contractId },
        data: { status: CrmContractStatus.signed },
      });
      await tx.crmContractEvent.create({
        data: {
          tenantId,
          contractId,
          eventType: 'signed',
          fromStatus: existing.status,
          toStatus: CrmContractStatus.signed,
          message: 'All signatures confirmed via provider webhook',
        },
      });
      await tx.crmUnit.updateMany({
        where: { id: existing.unitId, tenantId },
        data: {
          status: CrmUnitStatus.sold,
          contractId,
        },
      });
    });
  }
}
