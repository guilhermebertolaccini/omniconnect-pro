import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateAppDto } from './dto/create-app.dto';
import { UpdateAppDto } from './dto/update-app.dto';

@Injectable()
export class AppsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, createAppDto: CreateAppDto) {
    // Verificar se já existe um app com este nome no mesmo tenant
    const existingApp = await this.prisma.app.findFirst({
      where: { name: createAppDto.name, tenantId },
    });

    if (existingApp) {
      throw new BadRequestException('Já existe um app com este nome');
    }

    return this.prisma.app.create({
      data: {
        name: createAppDto.name,
        accessToken: createAppDto.accessToken,
        appSecret: createAppDto.appSecret || null,
        webhookVerifyToken: createAppDto.webhookVerifyToken || null,
        wabaId: createAppDto.wabaId || null,
        tenantId,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.app.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: number) {
    const app = await this.prisma.app.findFirst({
      where: { id, tenantId },
    });

    if (!app) {
      throw new NotFoundException(`App com ID ${id} não encontrado`);
    }

    return app;
  }

  async update(tenantId: string, id: number, updateAppDto: UpdateAppDto) {
    const app = await this.findOne(tenantId, id);

    // Se está atualizando o nome, verificar se não existe outro app com o mesmo nome
    if (updateAppDto.name && updateAppDto.name !== app.name) {
      const existingApp = await this.prisma.app.findFirst({
        where: { name: updateAppDto.name, tenantId },
      });

      if (existingApp) {
        throw new BadRequestException('Já existe um app com este nome');
      }
    }

    return this.prisma.app.update({
      where: { id },
      data: {
        ...(updateAppDto.name && { name: updateAppDto.name }),
        ...(updateAppDto.accessToken && { accessToken: updateAppDto.accessToken }),
        ...(updateAppDto.appSecret !== undefined && { appSecret: updateAppDto.appSecret || null }),
        ...(updateAppDto.webhookVerifyToken !== undefined && { webhookVerifyToken: updateAppDto.webhookVerifyToken || null }),
        ...(updateAppDto.wabaId !== undefined && { wabaId: updateAppDto.wabaId || null }),
      },
    });
  }

  async remove(tenantId: string, id: number) {
    const app = await this.findOne(tenantId, id);

    // Verificar se há linhas usando este app
    const linesUsingApp = await this.prisma.linesStock.findFirst({
      where: { appId: id, tenantId },
    });

    if (linesUsingApp) {
      throw new BadRequestException(
        `Não é possível excluir o app "${app.name}" pois existem linhas vinculadas a ele. Remova as linhas primeiro.`
      );
    }

    return this.prisma.app.delete({
      where: { id },
    });
  }
}

