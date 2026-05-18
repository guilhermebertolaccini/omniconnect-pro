import { Injectable, NotFoundException } from '@nestjs/common';
import { CrmLeadStage, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CrmActor, effectiveRole } from '../common/actor';
import {
  CreateCrmFollowUpDto,
  CreateCrmInteractionDto,
  CreateCrmLeadDto,
  UpdateCrmFollowUpDto,
  UpdateCrmLeadDto,
} from './dto/leads.dto';

/**
 * Leads pipeline. Realtime: o gateway (Bloco E) escuta os eventos
 * `crm.lead.created`/`crm.lead.updated`/`crm.followup.upserted` para
 * empurrar update na sala `tenant:{tenantId}:leads`.
 *
 * Restrição broker: usuário com tenantRole=broker só enxerga leads/follow-ups
 * onde brokerId === user.id. Admin/supervisor enxergam todos do tenant.
 */
@Injectable()
export class CrmLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  private brokerScope(actor: CrmActor): Prisma.CrmLeadWhereInput {
    return effectiveRole(actor) === Role.broker
      ? { brokerId: actor.id }
      : {};
  }

  // ----- Leads ---------------------------------------------------------------

  async createLead(tenantId: string, dto: CreateCrmLeadDto, actor: CrmActor) {
    const brokerId =
      effectiveRole(actor) === Role.broker
        ? actor.id
        : dto.brokerId ?? null;

    let brokerName: string | null = null;
    if (brokerId) {
      const broker = await this.prisma.user.findUnique({
        where: { id: brokerId },
        select: { name: true },
      });
      brokerName = broker?.name ?? null;
    }

    return this.prisma.crmLead.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        email: dto.email?.trim().toLowerCase() ?? null,
        phone: dto.phone?.trim() ?? null,
        source: dto.source?.trim() ?? null,
        stage: dto.stage ?? CrmLeadStage.new,
        brokerId,
        brokerName,
        propertyId: dto.propertyId ?? null,
        clientId: dto.clientId ?? null,
        propertyInterest: dto.propertyInterest ?? null,
        estimatedValue: dto.estimatedValue ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async findAllLeads(
    tenantId: string,
    actor: CrmActor,
    filters: { stage?: CrmLeadStage; search?: string } = {},
  ) {
    const where: Prisma.CrmLeadWhereInput = {
      tenantId,
      ...this.brokerScope(actor),
    };
    if (filters.stage) where.stage = filters.stage;
    if (filters.search?.trim()) {
      const s = filters.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.crmLead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneLead(tenantId: string, id: string, actor: CrmActor) {
    const row = await this.prisma.crmLead.findFirst({
      where: { id, tenantId, ...this.brokerScope(actor) },
    });
    if (!row) throw new NotFoundException('Lead not found for this tenant');
    return row;
  }

  async updateLead(
    tenantId: string,
    id: string,
    dto: UpdateCrmLeadDto,
    actor: CrmActor,
  ) {
    await this.findOneLead(tenantId, id, actor);
    const data: Prisma.CrmLeadUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined)
      data.email = dto.email?.toLowerCase() ?? null;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.stage !== undefined) data.stage = dto.stage;
    if (dto.propertyInterest !== undefined) data.propertyInterest = dto.propertyInterest;
    if (dto.estimatedValue !== undefined) data.estimatedValue = dto.estimatedValue;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.brokerId !== undefined) {
      if (effectiveRole(actor) === Role.broker) {
        throw new NotFoundException('Lead not found for this tenant');
      }
      data.broker = dto.brokerId
        ? { connect: { id: dto.brokerId } }
        : { disconnect: true };
      const broker = dto.brokerId
        ? await this.prisma.user.findUnique({
            where: { id: dto.brokerId },
            select: { name: true },
          })
        : null;
      data.brokerName = broker?.name ?? null;
    }
    if (dto.propertyId !== undefined) {
      data.property = dto.propertyId
        ? { connect: { id: dto.propertyId } }
        : { disconnect: true };
    }
    if (dto.clientId !== undefined) data.clientId = dto.clientId;
    return this.prisma.crmLead.update({ where: { id }, data });
  }

  async removeLead(tenantId: string, id: string, actor: CrmActor) {
    await this.findOneLead(tenantId, id, actor);
    await this.prisma.crmLead.delete({ where: { id } });
    return { id };
  }

  // ----- Interactions --------------------------------------------------------

  async createInteraction(
    tenantId: string,
    dto: CreateCrmInteractionDto,
    actor: CrmActor,
  ) {
    await this.findOneLead(tenantId, dto.leadId, actor);
    return this.prisma.crmInteraction.create({
      data: {
        tenantId,
        leadId: dto.leadId,
        type: dto.type,
        content: dto.content ?? null,
        createdById: actor.id,
      },
    });
  }

  async findInteractions(tenantId: string, leadId: string, actor: CrmActor) {
    await this.findOneLead(tenantId, leadId, actor);
    return this.prisma.crmInteraction.findMany({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ----- Follow-ups ----------------------------------------------------------

  async createFollowUp(
    tenantId: string,
    dto: CreateCrmFollowUpDto,
    actor: CrmActor,
  ) {
    await this.findOneLead(tenantId, dto.leadId, actor);
    return this.prisma.crmFollowUp.create({
      data: {
        tenantId,
        leadId: dto.leadId,
        scheduledAt: new Date(dto.scheduledAt),
        title: dto.title ?? null,
        notes: dto.notes ?? null,
        createdById: actor.id,
      },
    });
  }

  async findFollowUps(
    tenantId: string,
    actor: CrmActor,
    filters: { leadId?: string; status?: string } = {},
  ) {
    const where: Prisma.CrmFollowUpWhereInput = { tenantId };
    if (filters.leadId) where.leadId = filters.leadId;
    if (filters.status) where.status = filters.status;
    if (effectiveRole(actor) === Role.broker) {
      where.lead = { brokerId: actor.id };
    }
    return this.prisma.crmFollowUp.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async updateFollowUp(
    tenantId: string,
    id: string,
    dto: UpdateCrmFollowUpDto,
    actor: CrmActor,
  ) {
    const followUp = await this.prisma.crmFollowUp.findFirst({
      where: { id, tenantId },
      include: { lead: { select: { brokerId: true } } },
    });
    if (
      !followUp ||
      (effectiveRole(actor) === Role.broker &&
        followUp.lead.brokerId !== actor.id)
    ) {
      throw new NotFoundException('Follow-up not found for this tenant');
    }
    const data: Prisma.CrmFollowUpUpdateInput = {};
    if (dto.scheduledAt !== undefined)
      data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.completedAt = dto.status === 'done' ? new Date() : null;
    }
    return this.prisma.crmFollowUp.update({ where: { id }, data });
  }

  async removeFollowUp(tenantId: string, id: string, actor: CrmActor) {
    const existing = await this.prisma.crmFollowUp.findFirst({
      where: { id, tenantId },
      include: { lead: { select: { brokerId: true } } },
    });
    if (
      !existing ||
      (effectiveRole(actor) === Role.broker &&
        existing.lead.brokerId !== actor.id)
    ) {
      throw new NotFoundException('Follow-up not found for this tenant');
    }
    await this.prisma.crmFollowUp.delete({ where: { id } });
    return { id };
  }
}
