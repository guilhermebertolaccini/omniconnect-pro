import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateBlocklistDto } from './dto/create-blocklist.dto';
import { UpdateBlocklistDto } from './dto/update-blocklist.dto';

@Injectable()
export class BlocklistService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, createBlocklistDto: CreateBlocklistDto) {
    return this.prisma.blockList.create({
      data: { ...createBlocklistDto, tenantId },
    });
  }

  async findAll(tenantId: string, search?: string) {
    return this.prisma.blockList.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { cpf: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: number) {
    const blocklist = await this.prisma.blockList.findFirst({
      where: { id, tenantId },
    });

    if (!blocklist) {
      throw new NotFoundException(`Blocklist com ID ${id} não encontrado`);
    }

    return blocklist;
  }

  async isBlocked(tenantId: string, phone?: string, cpf?: string): Promise<boolean> {
    if (!phone && !cpf) return false;
    const blocked = await this.prisma.blockList.findFirst({
      where: {
        tenantId,
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(cpf ? [{ cpf }] : []),
        ],
      },
    });

    return !!blocked;
  }

  async update(tenantId: string, id: number, updateBlocklistDto: UpdateBlocklistDto) {
    await this.findOne(tenantId, id);

    return this.prisma.blockList.update({
      where: { id },
      data: updateBlocklistDto,
    });
  }

  async remove(tenantId: string, id: number) {
    await this.findOne(tenantId, id);

    return this.prisma.blockList.delete({
      where: { id },
    });
  }
}
