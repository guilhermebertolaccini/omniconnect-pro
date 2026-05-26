import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as argon2 from 'argon2';
import csv from 'csv-parser';
import { Readable } from 'stream';

const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  segment: true,
  line: true,
  status: true,
  oneToOneActive: true,
  createdAt: true,
  updatedAt: true,
  // Never select password
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a user inside the caller's active tenant. If the email is
   * already registered globally we treat it as a conflict — multi-tenant
   * membership for existing accounts is a separate flow (UserTenant).
   *
   * Membership row for the active tenant is created in the same
   * transaction so the new user shows up in tenant listings immediately.
   */
  async create(createUserDto: CreateUserDto, tenantId: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email já está em uso');
    }

    const hashedPassword = await argon2.hash(createUserDto.password);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ...createUserDto,
          password: hashedPassword,
        },
      });

      await tx.userTenant.create({
        data: {
          userId: created.id,
          tenantId,
          role: created.role,
        },
      });

      // Re-read without password
      return tx.user.findUnique({
        where: { id: created.id },
        select: USER_PUBLIC_SELECT,
      });
    });
  }

  /**
   * Return users that belong to the caller's tenant via UserTenant.
   * Replaces the old global findMany + email-domain heuristic for
   * supervisors. Admin, supervisor and digital all see the same scope
   * (their tenant) — roles affect what they can do, not who they see.
   */
  async findAll(filters: any, tenantId: string) {
    const { search, ...validFilters } = filters || {};

    const where: any = {
      ...validFilters,
      tenants: { some: { tenantId } },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: USER_PUBLIC_SELECT,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenants: { some: { tenantId } } },
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto, tenantId: string) {
    // Membership check — refuse to mutate users that are not part of the
    // caller's tenant even if the JWT role would otherwise allow it.
    await this.findOne(id, tenantId);

    // Limpar campos vazios
    const cleanData: any = { ...updateUserDto };

    // Remover password se estiver vazio/undefined
    if (!cleanData.password || cleanData.password === '') {
      delete cleanData.password;
    } else {
      // Hash da senha apenas se foi fornecida
      cleanData.password = await argon2.hash(cleanData.password);
    }

    // Converter strings vazias para null nos campos numéricos opcionais
    if (cleanData.segment === '' || cleanData.segment === undefined) {
      cleanData.segment = null;
    }
    if (cleanData.line === '' || cleanData.line === undefined) {
      cleanData.line = null;
    }

    // Garantir que oneToOneActive seja boolean (não undefined se não foi enviado)
    if (cleanData.oneToOneActive === undefined) {
      // Se não foi enviado, não alterar (manter valor atual)
      delete cleanData.oneToOneActive;
    } else {
      // Garantir que seja boolean
      cleanData.oneToOneActive = Boolean(cleanData.oneToOneActive);
    }

    console.log('💾 Dados limpos para atualizar:', cleanData);

    // updateMany with composite (id, membership) to be defense-in-depth
    // against any race where membership changes between findOne and update.
    const result = await this.prisma.user.updateMany({
      where: { id, tenants: { some: { tenantId } } },
      data: cleanData,
    });

    if (result.count === 0) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    return this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
  }

  /**
   * Remove the user's membership in the caller's tenant. Does NOT delete
   * the global user row — they may be a member of other tenants. If this
   * was the last membership, the user is then deleted entirely.
   */
  async remove(id: number, tenantId: string) {
    await this.findOne(id, tenantId);

    return this.prisma.$transaction(async (tx) => {
      // Remove only the membership in the active tenant
      await tx.userTenant.deleteMany({
        where: { userId: id, tenantId },
      });

      // If user has no remaining memberships, delete the user record
      const remaining = await tx.userTenant.count({
        where: { userId: id },
      });

      if (remaining === 0) {
        await tx.user.delete({ where: { id } });
        return { id, deleted: true, removedGlobalUser: true };
      }

      return { id, deleted: true, removedGlobalUser: false };
    });
  }

  async getOnlineOperators(tenantId: string, segment?: number) {
    return this.prisma.user.findMany({
      where: {
        role: 'operator',
        status: 'Online',
        tenants: { some: { tenantId } },
        ...(segment && { segment }),
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  /**
   * Bulk-import users from CSV. Each created user gets a membership row
   * for the importing tenant so they immediately appear in listings.
   */
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
          console.log(`📊 Processando ${results.length} linhas do CSV`);

          for (const row of results) {
            try {
              const name = row['Nome']?.trim();
              const email = row['E-mail']?.trim() || row['Email']?.trim();
              const segmentName = row['Segmento']?.trim();

              if (!name || !email) {
                errors.push(`Linha ignorada: Nome ou E-mail vazio (${name || 'sem nome'}, ${email || 'sem email'})`);
                continue;
              }

              // Verificar se usuário já existe globalmente
              const existingUser = await this.prisma.user.findUnique({
                where: { email },
              });

              if (existingUser) {
                errors.push(`Usuário já existe: ${email}`);
                continue;
              }

              // Buscar segmento pelo nome NO TENANT
              let segmentId: number | null = null;
              if (segmentName) {
                const segment = await this.prisma.segment.findFirst({
                  where: {
                    tenantId,
                    name: {
                      contains: segmentName,
                      mode: 'insensitive',
                    },
                  },
                });

                if (segment) {
                  segmentId = segment.id;
                } else {
                  errors.push(`Segmento não encontrado: ${segmentName} (usuário: ${email})`);
                  // Continuar criando o usuário sem segmento
                }
              }

              // Criar usuário (padrão: operador, senha inicial = @Pasc2025)
              const defaultPassword = '@Pasc2025';
              const hashedPassword = await argon2.hash(defaultPassword);

              await this.prisma.$transaction(async (tx) => {
                const created = await tx.user.create({
                  data: {
                    name,
                    email,
                    password: hashedPassword,
                    role: 'operator',
                    segment: segmentId,
                  },
                });

                await tx.userTenant.create({
                  data: {
                    userId: created.id,
                    tenantId,
                    role: 'operator',
                  },
                });
              });

              successCount++;
              console.log(`✅ Usuário criado: ${name} (${email})`);
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
