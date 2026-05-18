import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CrmUnitStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import {
  CreateCrmUnitDto,
  UpdateCrmUnitDto,
  UpdateCrmUnitStatusDto,
} from './dto/units.dto';

@Injectable()
export class CrmUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCrmUnitDto) {
    // Garante que o property pertence ao tenant.
    const property = await this.prisma.crmProperty.findFirst({
      where: { id: dto.propertyId, tenantId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundException('Property not found for this tenant');
    }
    return this.prisma.crmUnit.create({
      data: {
        tenantId,
        propertyId: dto.propertyId,
        number: dto.number.trim(),
        tower: dto.tower?.trim() ?? null,
        typology: dto.typology?.trim() ?? null,
        floor: dto.floor ?? null,
        area: dto.area ?? null,
        price: dto.price ?? null,
        status: dto.status ?? CrmUnitStatus.available,
        observations: dto.observations ?? null,
      },
    });
  }

  async findAll(
    tenantId: string,
    filters: { propertyId?: string; status?: CrmUnitStatus } = {},
  ) {
    const where: Prisma.CrmUnitWhereInput = { tenantId };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.status) where.status = filters.status;
    return this.prisma.crmUnit.findMany({
      where,
      orderBy: [{ tower: 'asc' }, { number: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const row = await this.prisma.crmUnit.findFirst({
      where: { id, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Unit not found for this tenant');
    }
    return row;
  }

  async update(tenantId: string, id: string, dto: UpdateCrmUnitDto) {
    await this.findOne(tenantId, id);
    const data: Prisma.CrmUnitUpdateInput = {};
    if (dto.number !== undefined) data.number = dto.number.trim();
    if (dto.tower !== undefined) data.tower = dto.tower;
    if (dto.typology !== undefined) data.typology = dto.typology;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.area !== undefined) data.area = dto.area;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.observations !== undefined) data.observations = dto.observations;
    return this.prisma.crmUnit.update({ where: { id }, data });
  }

  async updateStatus(tenantId: string, id: string, dto: UpdateCrmUnitStatusDto) {
    const existing = await this.findOne(tenantId, id);
    if (dto.status === CrmUnitStatus.reserved && !dto.clientId) {
      throw new BadRequestException(
        'reserved status requires clientId of the prospective buyer',
      );
    }
    if (dto.clientId) {
      const client = await this.prisma.crmClient.findFirst({
        where: { id: dto.clientId, tenantId },
        select: { id: true },
      });
      if (!client) {
        throw new NotFoundException('Client not found for this tenant');
      }
    }
    const reservationExpiry =
      dto.status === CrmUnitStatus.reserved && dto.reservationExpiry
        ? new Date(dto.reservationExpiry)
        : dto.status === CrmUnitStatus.available
          ? null
          : existing.reservationExpiry;
    return this.prisma.crmUnit.update({
      where: { id },
      data: {
        status: dto.status,
        clientId: dto.clientId ?? null,
        reservedAt:
          dto.status === CrmUnitStatus.reserved ? new Date() : existing.reservedAt,
        reservationExpiry,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.crmUnit.delete({ where: { id } });
    return { id };
  }
}
