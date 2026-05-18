import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CrmProposalStatus,
  CrmUnitStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CrmRealtimeService } from '../../crm-realtime/crm-realtime.service';
import { CrmActor, effectiveRole } from '../common/actor';
import {
  CreateCrmProposalDto,
  TransitionCrmProposalDto,
  UpdateCrmProposalDto,
} from './dto/proposals.dto';

const STATUS_TRANSITIONS: Record<CrmProposalStatus, CrmProposalStatus[]> = {
  [CrmProposalStatus.draft]: [CrmProposalStatus.sent, CrmProposalStatus.rejected],
  [CrmProposalStatus.sent]: [
    CrmProposalStatus.accepted,
    CrmProposalStatus.rejected,
  ],
  [CrmProposalStatus.accepted]: [],
  [CrmProposalStatus.rejected]: [CrmProposalStatus.draft],
};

@Injectable()
export class CrmProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: CrmRealtimeService,
  ) {}

  private brokerScope(actor: CrmActor): Prisma.CrmProposalWhereInput {
    return effectiveRole(actor) === Role.broker
      ? { brokerId: actor.id }
      : {};
  }

  async create(
    tenantId: string,
    dto: CreateCrmProposalDto,
    actor: CrmActor,
  ) {
    const isBroker = effectiveRole(actor) === Role.broker;
    if (!isBroker && !dto.brokerId) {
      throw new BadRequestException('brokerId is required for admin/supervisor');
    }
    const brokerId = isBroker ? actor.id : (dto.brokerId as number);

    const [property, unit, client, broker] = await Promise.all([
      this.prisma.crmProperty.findFirst({
        where: { id: dto.propertyId, tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.crmUnit.findFirst({
        where: { id: dto.unitId, tenantId, propertyId: dto.propertyId },
        select: { id: true, number: true, status: true },
      }),
      this.prisma.crmClient.findFirst({
        where: { id: dto.clientId, tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: brokerId },
        select: { id: true, name: true },
      }),
    ]);
    if (!property) throw new NotFoundException('Property not found for this tenant');
    if (!unit) throw new NotFoundException('Unit not found for this property');
    if (!client) throw new NotFoundException('Client not found for this tenant');
    if (!broker) throw new NotFoundException('Broker not found');
    if (unit.status === CrmUnitStatus.sold) {
      throw new BadRequestException('Unit is already sold');
    }

    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.crmProposal.create({
        data: {
          tenantId,
          propertyId: dto.propertyId,
          unitId: dto.unitId,
          clientId: dto.clientId,
          brokerId,
          propertyName: property.name,
          unitNumber: unit.number,
          clientName: client.name,
          brokerName: broker.name,
          originalPrice: dto.originalPrice ?? null,
          discount: dto.discount ?? null,
          discountPercent: dto.discountPercent ?? null,
          finalPrice: dto.finalPrice ?? null,
          paymentCondition: (dto.paymentCondition ??
            {}) as Prisma.InputJsonValue,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          notes: dto.notes ?? null,
        },
      });
      await tx.crmProposalEvent.create({
        data: {
          tenantId,
          proposalId: proposal.id,
          eventType: 'created',
          toStatus: CrmProposalStatus.draft,
          createdById: actor.id,
        },
      });
      return proposal;
    });
  }

  async findAll(tenantId: string, actor: CrmActor, status?: CrmProposalStatus) {
    return this.prisma.crmProposal.findMany({
      where: { tenantId, ...this.brokerScope(actor), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string, actor: CrmActor) {
    const row = await this.prisma.crmProposal.findFirst({
      where: { id, tenantId, ...this.brokerScope(actor) },
      include: { events: { orderBy: { createdAt: 'desc' } } },
    });
    if (!row) throw new NotFoundException('Proposal not found for this tenant');
    return row;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCrmProposalDto,
    actor: CrmActor,
  ) {
    const existing = await this.findOne(tenantId, id, actor);
    if (existing.status === CrmProposalStatus.accepted) {
      throw new ForbiddenException('Accepted proposals cannot be edited');
    }
    const data: Prisma.CrmProposalUpdateInput = {};
    if (dto.originalPrice !== undefined) data.originalPrice = dto.originalPrice;
    if (dto.discount !== undefined) data.discount = dto.discount;
    if (dto.discountPercent !== undefined) data.discountPercent = dto.discountPercent;
    if (dto.finalPrice !== undefined) data.finalPrice = dto.finalPrice;
    if (dto.paymentCondition !== undefined)
      data.paymentCondition = dto.paymentCondition as Prisma.InputJsonValue;
    if (dto.validUntil !== undefined)
      data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.pdfUrl !== undefined) data.pdfUrl = dto.pdfUrl;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.crmProposal.update({ where: { id }, data });
      if (dto.pdfUrl !== undefined && dto.pdfUrl !== existing.pdfUrl) {
        await tx.crmProposalEvent.create({
          data: {
            tenantId,
            proposalId: id,
            eventType: dto.pdfUrl ? 'pdf_attached' : 'pdf_removed',
            toStatus: existing.status,
            message: dto.pdfUrl ? 'PDF attached or replaced' : 'PDF removed',
            createdById: actor.id,
          },
        });
      }
      return updated;
    });
  }

  async transition(
    tenantId: string,
    id: string,
    dto: TransitionCrmProposalDto,
    actor: CrmActor,
  ) {
    const existing = await this.findOne(tenantId, id, actor);
    const allowed = STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition proposal from ${existing.status} to ${dto.status}`,
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.crmProposal.update({
        where: { id },
        data: { status: dto.status },
      });
      await tx.crmProposalEvent.create({
        data: {
          tenantId,
          proposalId: id,
          eventType: 'status_changed',
          fromStatus: existing.status,
          toStatus: dto.status,
          message: dto.message ?? null,
          createdById: actor.id,
        },
      });
      if (
        dto.status === CrmProposalStatus.accepted &&
        existing.status !== CrmProposalStatus.accepted
      ) {
        await tx.crmUnit.updateMany({
          where: {
            id: existing.unitId,
            tenantId,
            status: { not: CrmUnitStatus.sold },
          },
          data: {
            status: CrmUnitStatus.reserved,
            clientId: existing.clientId,
            reservedAt: new Date(),
            proposalId: id,
          },
        });
      }
      return u;
    });
    this.realtime.emitToTenant(tenantId, 'crm.proposal.transitioned', {
      id,
      fromStatus: existing.status,
      toStatus: dto.status,
    });
    return updated;
  }

  async remove(tenantId: string, id: string, actor: CrmActor) {
    const existing = await this.findOne(tenantId, id, actor);
    if (existing.status === CrmProposalStatus.accepted) {
      throw new ForbiddenException('Accepted proposals cannot be removed');
    }
    await this.prisma.crmProposal.delete({ where: { id } });
    return { id };
  }

  async listEvents(tenantId: string, id: string, actor: CrmActor) {
    await this.findOne(tenantId, id, actor);
    return this.prisma.crmProposalEvent.findMany({
      where: { tenantId, proposalId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
