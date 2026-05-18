import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CrmCommissionStatus,
  CrmPaymentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CrmActor, effectiveRole } from '../common/actor';
import { MarkCommissionDto, MarkPaymentDto } from './dto/financial.dto';

@Injectable()
export class CrmFinancialService {
  constructor(private readonly prisma: PrismaService) {}

  // ----- Payments ------------------------------------------------------------

  async findPayments(
    tenantId: string,
    actor: CrmActor,
    filters: { contractId?: string; status?: CrmPaymentStatus } = {},
  ) {
    const where: Prisma.CrmPaymentWhereInput = { tenantId };
    if (filters.contractId) where.contractId = filters.contractId;
    if (filters.status) where.status = filters.status;
    if (effectiveRole(actor) === Role.broker) {
      where.contract = { brokerId: actor.id };
    }
    return this.prisma.crmPayment.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
  }

  async markPayment(
    tenantId: string,
    id: string,
    dto: MarkPaymentDto,
    _actor: CrmActor,
  ) {
    const existing = await this.prisma.crmPayment.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Payment not found for this tenant');
    }
    return this.prisma.crmPayment.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt:
          dto.status === CrmPaymentStatus.paid
            ? new Date(dto.paidAt ?? Date.now())
            : null,
      },
    });
  }

  // ----- Commissions ---------------------------------------------------------

  async findCommissions(
    tenantId: string,
    actor: CrmActor,
    filters: { brokerId?: number; status?: CrmCommissionStatus } = {},
  ) {
    const where: Prisma.CrmCommissionWhereInput = { tenantId };
    if (filters.status) where.status = filters.status;
    if (effectiveRole(actor) === Role.broker) {
      where.brokerId = actor.id;
    } else if (filters.brokerId !== undefined) {
      where.brokerId = filters.brokerId;
    }
    return this.prisma.crmCommission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async markCommission(
    tenantId: string,
    id: string,
    dto: MarkCommissionDto,
  ) {
    const existing = await this.prisma.crmCommission.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Commission not found for this tenant');
    }
    return this.prisma.crmCommission.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt:
          dto.status === CrmCommissionStatus.paid
            ? new Date(dto.paidAt ?? Date.now())
            : null,
      },
    });
  }
}
