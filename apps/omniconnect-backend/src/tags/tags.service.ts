import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, createTagDto: CreateTagDto) {
    const existingTag = await this.prisma.tag.findFirst({
      where: { name: createTagDto.name, tenantId },
    });

    if (existingTag) {
      throw new ConflictException('Tag com este nome já existe');
    }

    return this.prisma.tag.create({
      data: { ...createTagDto, tenantId },
    });
  }

  async findAll(tenantId: string, filters?: any) {
    const { search, ...validFilters } = filters || {};

    const where = search
      ? {
          tenantId,
          ...validFilters,
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : { tenantId, ...validFilters };

    return this.prisma.tag.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: number) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, tenantId },
    });

    if (!tag) {
      throw new NotFoundException(`Tag com ID ${id} não encontrada`);
    }

    return tag;
  }

  async findByName(tenantId: string, name: string) {
    return this.prisma.tag.findFirst({
      where: { name, tenantId },
    });
  }

  async update(tenantId: string, id: number, updateTagDto: UpdateTagDto) {
    await this.findOne(tenantId, id);

    if (updateTagDto.name) {
      const existingTag = await this.prisma.tag.findFirst({
        where: {
          tenantId,
          name: updateTagDto.name,
          id: { not: id },
        },
      });

      if (existingTag) {
        throw new ConflictException('Tag com este nome já existe');
      }
    }

    const cleanData: any = { ...updateTagDto };
    if (cleanData.segment === '' || cleanData.segment === undefined) {
      cleanData.segment = null;
    }

    return this.prisma.tag.update({
      where: { id },
      data: cleanData,
    });
  }

  async remove(tenantId: string, id: number) {
    await this.findOne(tenantId, id);

    return this.prisma.tag.delete({
      where: { id },
    });
  }
}
