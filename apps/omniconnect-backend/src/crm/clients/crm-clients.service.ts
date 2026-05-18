import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { summarizeClient, CrmClientSummary } from '../common/pii';
import { CreateCrmClientDto, UpdateCrmClientDto } from './dto/clients.dto';

/**
 * CrmClient guarda PII pesada (CPF/CNPJ, income, email, phone). Por isso:
 *  - `findAll` retorna SEMPRE a versão mascarada (summarizeClient).
 *  - `findOne` devolve o registro inteiro, mas o controller já é restrito
 *    a admin/supervisor + brokerId === user.id.
 *  - Logs nunca mencionam cpfCnpj/email crus.
 */
@Injectable()
export class CrmClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCrmClientDto, actorBrokerId?: number) {
    return this.prisma.crmClient.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        cpfCnpj: dto.cpfCnpj?.trim() ?? null,
        phone: dto.phone?.trim() ?? null,
        email: dto.email?.trim().toLowerCase() ?? null,
        income: dto.income ?? null,
        score: dto.score ?? null,
        notes: dto.notes ?? null,
        brokerId: dto.brokerId ?? actorBrokerId ?? null,
      },
    });
  }

  async findAll(
    tenantId: string,
    options: { brokerId?: number; search?: string; restrictToBroker?: boolean } = {},
  ): Promise<CrmClientSummary[]> {
    const where: Prisma.CrmClientWhereInput = { tenantId };
    if (options.restrictToBroker && options.brokerId) {
      where.brokerId = options.brokerId;
    } else if (options.brokerId !== undefined) {
      where.brokerId = options.brokerId;
    }
    if (options.search?.trim()) {
      const s = options.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.crmClient.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(summarizeClient);
  }

  async findOne(
    tenantId: string,
    id: string,
    actor: { id: number; role: Role | null; tenantRole: Role | null },
  ) {
    const row = await this.prisma.crmClient.findFirst({
      where: { id, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Client not found for this tenant');
    }
    const effectiveRole = actor.tenantRole ?? actor.role;
    if (effectiveRole === Role.broker && row.brokerId !== actor.id) {
      throw new NotFoundException('Client not found for this tenant');
    }
    return row;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCrmClientDto,
    actor: { id: number; role: Role | null; tenantRole: Role | null },
  ) {
    const existing = await this.findOne(tenantId, id, actor);
    const data: Prisma.CrmClientUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.cpfCnpj !== undefined) data.cpfCnpj = dto.cpfCnpj;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email?.toLowerCase() ?? null;
    if (dto.income !== undefined) data.income = dto.income;
    if (dto.score !== undefined) data.score = dto.score;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.brokerId !== undefined) {
      data.broker = dto.brokerId
        ? { connect: { id: dto.brokerId } }
        : { disconnect: true };
    }
    return this.prisma.crmClient.update({
      where: { id: existing.id },
      data,
    });
  }

  async remove(
    tenantId: string,
    id: string,
    actor: { id: number; role: Role | null; tenantRole: Role | null },
  ) {
    const existing = await this.findOne(tenantId, id, actor);
    await this.prisma.crmClient.delete({ where: { id: existing.id } });
    return { id: existing.id };
  }
}
