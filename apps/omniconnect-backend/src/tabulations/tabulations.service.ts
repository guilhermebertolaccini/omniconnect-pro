import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTabulationDto } from './dto/create-tabulation.dto';
import { UpdateTabulationDto } from './dto/update-tabulation.dto';
import { Readable } from 'stream';
import csv from 'csv-parser';

@Injectable()
export class TabulationsService {
  constructor(private prisma: PrismaService) { }

  async create(createTabulationDto: CreateTabulationDto, tenantId: string) {
    return this.prisma.tabulation.create({
      data: { ...createTabulationDto, tenantId },
    });
  }

  async findAll(tenantId: string, search?: string) {
    return this.prisma.tabulation.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: number, tenantId: string) {
    const tabulation = await this.prisma.tabulation.findFirst({
      where: { id, tenantId },
    });

    if (!tabulation) {
      throw new NotFoundException(`Tabulação com ID ${id} não encontrada`);
    }

    return tabulation;
  }

  async update(id: number, updateTabulationDto: UpdateTabulationDto, tenantId: string) {
    await this.findOne(id, tenantId);

    const result = await this.prisma.tabulation.updateMany({
      where: { id, tenantId },
      data: updateTabulationDto,
    });

    if (result.count === 0) {
      throw new NotFoundException(`Tabulação com ID ${id} não encontrada`);
    }

    return this.prisma.tabulation.findFirst({
      where: { id, tenantId },
    });
  }

  async remove(id: number, tenantId: string) {
    await this.findOne(id, tenantId);

    const result = await this.prisma.tabulation.deleteMany({
      where: { id, tenantId },
    });

    if (result.count === 0) {
      throw new NotFoundException(`Tabulação com ID ${id} não encontrada`);
    }

    return { id, deleted: true };
  }

  async importFromCSV(
    file: Express.Multer.File,
    tenantId: string,
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
          // Filtrar linhas vazias manualmente
          const hasData = Object.values(data).some(value => value && String(value).trim() !== '');
          if (hasData) {
            results.push(data);
          }
        })
        .on('end', async () => {
          console.log(`📊 Processando ${results.length} linhas do CSV de tabulações`);

          for (const row of results) {
            try {
              // Tentar diferentes nomes de coluna
              const name = row['FINALIZAÇÃO NORMALIZADA']?.trim() ||
                row['FINALIZACAO NORMALIZADA']?.trim() ||
                row['Nome']?.trim() ||
                row['Name']?.trim() ||
                row['Tabulação']?.trim() ||
                row['Tabulation']?.trim();

              const isCPCStr = row['CPC']?.trim() || row['isCPC']?.trim() || row['Is CPC']?.trim();

              // Converter strings para boolean
              const isCPC = isCPCStr
                ? (isCPCStr.toLowerCase() === 'true' || isCPCStr.toLowerCase() === 'sim' || isCPCStr.toLowerCase() === 'yes' || isCPCStr === '1')
                : false;

              const isEnvioStr = row['ENVIO']?.trim() || row['isEnvio']?.trim();
              const isEnvio = isEnvioStr
                ? (isEnvioStr.toLowerCase() === 'true' || isEnvioStr.toLowerCase() === 'sim' || isEnvioStr.toLowerCase() === 'yes' || isEnvioStr === '1')
                : true; // Default true

              const isEntregueStr = row['ENTREGUE']?.trim() || row['isEntregue']?.trim();
              const isEntregue = isEntregueStr
                ? (isEntregueStr.toLowerCase() === 'true' || isEntregueStr.toLowerCase() === 'sim' || isEntregueStr.toLowerCase() === 'yes' || isEntregueStr === '1')
                : true; // Default true

              const isLidoStr = row['LIDO']?.trim() || row['isLido']?.trim();
              const isLido = isLidoStr
                ? (isLidoStr.toLowerCase() === 'true' || isLidoStr.toLowerCase() === 'sim' || isLidoStr.toLowerCase() === 'yes' || isLidoStr === '1')
                : true; // Default true

              const isRetornoStr = row['RETORNO']?.trim() || row['isRetorno']?.trim();
              const isRetorno = isRetornoStr
                ? (isRetornoStr.toLowerCase() === 'true' || isRetornoStr.toLowerCase() === 'sim' || isRetornoStr.toLowerCase() === 'yes' || isRetornoStr === '1')
                : true; // Default true

              const isCPCProdStr = row['CPC_PROD']?.trim() || row['isCPCProd']?.trim();
              const isCPCProd = isCPCProdStr
                ? (isCPCProdStr.toLowerCase() === 'true' || isCPCProdStr.toLowerCase() === 'sim' || isCPCProdStr.toLowerCase() === 'yes' || isCPCProdStr === '1')
                : false;

              const isBoletoStr = row['BOLETO']?.trim() || row['isBoleto']?.trim();
              const isBoleto = isBoletoStr
                ? (isBoletoStr.toLowerCase() === 'true' || isBoletoStr.toLowerCase() === 'sim' || isBoletoStr.toLowerCase() === 'yes' || isBoletoStr === '1')
                : false;

              if (!name) {
                errors.push(`Linha ignorada: Nome vazio`);
                continue;
              }

              // Normalizar nome (lowercase para comparação)
              const normalizedName = name.toLowerCase();

              // Verificar se já processamos este nome nesta importação
              if (processedNames.has(normalizedName)) {
                continue; // Pular duplicatas no mesmo CSV
              }

              processedNames.add(normalizedName);

              // Verificar se tabulação já existe NO TENANT (não global)
              const existing = await this.prisma.tabulation.findFirst({
                where: {
                  tenantId,
                  name: {
                    equals: name,
                    mode: 'insensitive',
                  },
                },
              });

              if (existing) {
                errors.push(`Tabulação já existe: ${name}`);
                continue;
              }

              // Criar tabulação
              await this.prisma.tabulation.create({
                data: {
                  name,
                  isCPC,
                  isEnvio,
                  isEntregue,
                  isLido,
                  isRetorno,
                  isCPCProd,
                  isBoleto,
                  tenantId,
                },
              });

              successCount++;
              console.log(`✅ Tabulação criada: ${name} (CPC: ${isCPC})`);

            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
              errors.push(`Erro ao processar linha: ${errorMsg}`);
              console.error('❌ Erro ao processar linha do CSV:', error);
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
