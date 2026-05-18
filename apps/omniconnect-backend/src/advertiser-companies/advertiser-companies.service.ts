import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  CreateAdvertiserCompanyDto,
  UpdateAdvertiserCompanyDto,
} from './dto/advertiser-company.dto';

@Injectable()
export class AdvertiserCompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    dto: CreateAdvertiserCompanyDto,
    actorUserId?: number,
  ) {
    if (!dto.name?.trim() || !dto.businessName?.trim()) {
      throw new BadRequestException('name and businessName are required');
    }
    return this.prisma.advertiserCompany.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        businessName: dto.businessName.trim(),
        metaBusinessId: dto.metaBusinessId ?? null,
        currency: dto.currency ?? 'BRL',
        timezone: dto.timezone ?? 'America/Sao_Paulo',
        status: dto.status ?? 'pending',
        createdById: actorUserId ?? null,
      },
    });
  }

  async findAll(tenantId: string, search?: string, status?: string) {
    const where: Prisma.AdvertiserCompanyWhereInput = { tenantId };
    if (status) where.status = status;
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { businessName: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }
    return this.prisma.advertiserCompany.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const record = await this.prisma.advertiserCompany.findFirst({
      where: { id, tenantId },
    });
    if (!record) {
      throw new NotFoundException('Advertiser company not found for this tenant');
    }
    return record;
  }

  async update(tenantId: string, id: string, dto: UpdateAdvertiserCompanyDto) {
    const existing = await this.prisma.advertiserCompany.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Advertiser company not found for this tenant');
    }
    const data: Prisma.AdvertiserCompanyUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.businessName !== undefined) data.businessName = dto.businessName.trim();
    if (dto.metaBusinessId !== undefined) data.metaBusinessId = dto.metaBusinessId;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.activeCampaigns !== undefined) data.activeCampaigns = dto.activeCampaigns;
    return this.prisma.advertiserCompany.update({
      where: { id },
      data,
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.advertiserCompany.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Advertiser company not found for this tenant');
    }
    await this.prisma.advertiserCompany.delete({ where: { id } });
    return { id };
  }
}
