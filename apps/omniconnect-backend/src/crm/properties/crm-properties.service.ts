import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import {
  CommissionConfigDto,
  CreateCrmPropertyDto,
  UpdateCrmPropertyDto,
} from './dto/properties.dto';

@Injectable()
export class CrmPropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCrmPropertyDto, actorId?: number) {
    return this.prisma.crmProperty.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        address: dto.address.trim(),
        city: dto.city.trim(),
        developer: dto.developer?.trim() ?? null,
        imageUrl: dto.imageUrl ?? null,
        towers: (dto.towers ?? []) as Prisma.InputJsonValue,
        documents: (dto.documents ?? []) as Prisma.InputJsonValue,
        createdById: actorId ?? null,
      },
    });
  }

  async findAll(tenantId: string, search?: string) {
    const where: Prisma.CrmPropertyWhereInput = { tenantId };
    if (search?.trim()) {
      const s = search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { address: { contains: s, mode: 'insensitive' } },
        { city: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.crmProperty.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const row = await this.prisma.crmProperty.findFirst({
      where: { id, tenantId },
      include: { commissionConfig: true },
    });
    if (!row) {
      throw new NotFoundException('Property not found for this tenant');
    }
    return row;
  }

  async update(tenantId: string, id: string, dto: UpdateCrmPropertyDto) {
    const existing = await this.prisma.crmProperty.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Property not found for this tenant');
    }
    const data: Prisma.CrmPropertyUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.address !== undefined) data.address = dto.address.trim();
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.developer !== undefined) data.developer = dto.developer;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.towers !== undefined) data.towers = dto.towers as Prisma.InputJsonValue;
    if (dto.documents !== undefined)
      data.documents = dto.documents as Prisma.InputJsonValue;
    return this.prisma.crmProperty.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.crmProperty.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Property not found for this tenant');
    }
    await this.prisma.crmProperty.delete({ where: { id } });
    return { id };
  }

  /**
   * Upsert do percentual de comissão de um property. `5%` é o default
   * imposto também no trigger SQL on-signed; manter aqui sincronizado.
   */
  async setCommissionConfig(
    tenantId: string,
    propertyId: string,
    dto: CommissionConfigDto,
    actorId?: number,
  ) {
    const property = await this.prisma.crmProperty.findFirst({
      where: { id: propertyId, tenantId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundException('Property not found for this tenant');
    }
    if (dto.commissionPercent < 0 || dto.commissionPercent > 100) {
      throw new BadRequestException('commissionPercent must be between 0 and 100');
    }
    return this.prisma.crmCommissionConfig.upsert({
      where: { propertyId },
      create: {
        tenantId,
        propertyId,
        commissionPercent: dto.commissionPercent,
        updatedById: actorId ?? null,
      },
      update: {
        commissionPercent: dto.commissionPercent,
        updatedById: actorId ?? null,
      },
    });
  }

  async getCommissionConfig(tenantId: string, propertyId: string) {
    await this.findOne(tenantId, propertyId);
    return this.prisma.crmCommissionConfig.findUnique({
      where: { propertyId },
    });
  }
}
