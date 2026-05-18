import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import csv from 'csv-parser';
import { Readable } from 'stream';

@Injectable()
export class SegmentsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, createSegmentDto: CreateSegmentDto) {
    const existing = await this.prisma.segment.findFirst({
      where: { name: createSegmentDto.name, tenantId },
    });

    if (existing) {
      throw new ConflictException('Segmento com este nome já existe');
    }

    return this.prisma.segment.create({
      data: { ...createSegmentDto, tenantId },
    });
  }

  async findAll(tenantId: string, search?: string, segmentId?: number) {
    const where: any = { tenantId };

    if (segmentId) {
      where.id = segmentId;
    }

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    return this.prisma.segment.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: number) {
    const segment = await this.prisma.segment.findFirst({
      where: { id, tenantId },
    });

    if (!segment) {
      throw new NotFoundException(`Segmento com ID ${id} não encontrado`);
    }

    return segment;
  }

  async update(tenantId: string, id: number, updateSegmentDto: UpdateSegmentDto) {
    await this.findOne(tenantId, id);

    return this.prisma.segment.update({
      where: { id },
      data: updateSegmentDto,
    });
  }

  async remove(tenantId: string, id: number) {
    await this.findOne(tenantId, id);

    return this.prisma.segment.delete({
      where: { id },
    });
  }

  async importFromCSV(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<{ success: number; errors: string[] }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Arquivo CSV não fornecido');
    }

    const results: any[] = [];
    const errors: string[] = [];
    let successCount = 0;
    const processedNames = new Set<string>();

    return new Promise((resolve, reject) => {
      const stream = Readable.from(file.buffer.toString('utf-8'));

      stream
        .pipe(csv({ separator: ';' }))
        .on('data', (data) => {
          const hasData = Object.values(data).some((value) => value && String(value).trim() !== '');
          if (hasData) {
            results.push(data);
          }
        })
        .on('end', async () => {
          for (const row of results) {
            try {
              const name =
                row['Nome']?.trim() ||
                row['Name']?.trim() ||
                row['Segmento']?.trim() ||
                row['Segment']?.trim();

              if (!name) {
                errors.push('Linha ignorada: Nome vazio');
                continue;
              }

              const normalizedName = name.toLowerCase();

              if (processedNames.has(normalizedName)) {
                continue;
              }

              processedNames.add(normalizedName);

              const existing = await this.prisma.segment.findFirst({
                where: {
                  tenantId,
                  name: {
                    equals: name,
                    mode: 'insensitive',
                  },
                },
              });

              if (existing) {
                errors.push(`Segmento já existe: ${name}`);
                continue;
              }

              await this.prisma.segment.create({
                data: { name, tenantId },
              });

              successCount++;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
              errors.push(`Erro ao processar linha: ${errorMsg}`);
            }
          }

          resolve({ success: successCount, errors });
        })
        .on('error', (error) => {
          reject(new BadRequestException(`Erro ao processar CSV: ${error.message}`));
        });
    });
  }
}
