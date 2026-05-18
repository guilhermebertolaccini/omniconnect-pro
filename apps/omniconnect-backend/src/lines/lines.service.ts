import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateLineDto } from './dto/create-line.dto';
import { UpdateLineDto } from './dto/update-line.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { SystemEventsService, EventType, EventModule, EventSeverity } from '../system-events/system-events.service';
import { WhatsappCloudService } from '../whatsapp-cloud/whatsapp-cloud.service';

@Injectable()
export class LinesService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    private controlPanelService: ControlPanelService,
    private systemEventsService: SystemEventsService,
    private whatsappCloudService: WhatsappCloudService,
  ) { }

  private requireTenant(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
  }

  async create(tenantId: string, createLineDto: CreateLineDto, createdBy?: number) {
    this.requireTenant(tenantId);

    if (!createLineDto.appId) {
      throw new BadRequestException('AppId é obrigatório');
    }
    if (!createLineDto.numberId || createLineDto.numberId === '') {
      throw new BadRequestException('NumberId é obrigatório');
    }

    // Buscar o App escopado por tenant.
    const app = await this.prisma.app.findFirst({
      where: { id: createLineDto.appId, tenantId },
    });

    if (!app) {
      throw new BadRequestException(`App com ID ${createLineDto.appId} não encontrado`);
    }

    // Telefone único por tenant.
    const existingLine = await this.prisma.linesStock.findFirst({
      where: { phone: createLineDto.phone, tenantId },
    });

    if (existingLine) {
      throw new BadRequestException('Já existe uma linha com este telefone');
    }

    const existingNumberId = await this.prisma.linesStock.findFirst({
      where: { numberId: createLineDto.numberId, tenantId },
    });

    if (existingNumberId) {
      throw new BadRequestException('Já existe uma linha com este NumberId');
    }

    try {
      const isValid = await this.whatsappCloudService.validateCredentials(
        app.accessToken,
        createLineDto.numberId,
      );

      if (!isValid) {
        throw new BadRequestException('Credenciais inválidas. Verifique o accessToken do app e o numberId.');
      }
    } catch (error) {
      throw new BadRequestException(
        `Erro ao validar credenciais: ${error.message || 'AccessToken do app ou NumberId inválidos'}`
      );
    }

    try {
      const newLine = await this.prisma.linesStock.create({
        data: {
          tenantId,
          phone: createLineDto.phone,
          lineStatus: createLineDto.lineStatus || 'active',
          segment: createLineDto.segment,
          oficial: true,
          appId: createLineDto.appId,
          numberId: createLineDto.numberId,
          receiveMedia: createLineDto.receiveMedia || false,
          createdBy,
        },
      });

      await this.systemEventsService.logEvent(
        EventType.LINE_CREATED,
        EventModule.LINES,
        {
          lineId: newLine.id,
          linePhone: newLine.phone,
          numberId: newLine.numberId,
        },
        createdBy || undefined,
        EventSeverity.INFO,
        tenantId,
      );

      return newLine;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Telefone ou NumberId já cadastrado');
      }

      throw new BadRequestException(`Erro ao criar linha: ${error.message}`);
    }
  }

  async findAll(tenantId: string, filters?: any) {
    this.requireTenant(tenantId);
    const { search, ...validFilters } = filters || {};

    const where: any = search
      ? {
        ...validFilters,
        tenantId,
        OR: [
          { phone: { contains: search } },
          { numberId: { contains: search } },
        ],
      }
      : { ...validFilters, tenantId };

    const lines = await this.prisma.linesStock.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        operators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const appIds = [...new Set(lines.map(l => l.appId))];
    const apps = await this.prisma.app.findMany({
      where: { id: { in: appIds }, tenantId },
    });
    const appsMap = new Map(apps.map(a => [a.id, a]));

    return lines.map(line => ({
      ...line,
      app: appsMap.get(line.appId) || null,
      operators: line.operators.map(lo => ({
        id: lo.user.id,
        name: lo.user.name,
        email: lo.user.email,
      })),
    }));
  }

  async findOne(tenantId: string, id: number) {
    this.requireTenant(tenantId);
    const line = await this.prisma.linesStock.findFirst({
      where: { id, tenantId },
    });

    if (!line) {
      throw new NotFoundException(`Linha com ID ${id} não encontrada`);
    }

    const app = await this.prisma.app.findFirst({
      where: { id: line.appId, tenantId },
    });

    return {
      ...line,
      app: app || null,
    };
  }

  /**
   * Testa conexão com Meta API
   * Cloud API não usa QR Code - este método valida as credenciais
   */
  async testConnection(tenantId: string, id: number) {
    const line = await this.findOne(tenantId, id);

    if (!line.appId || !line.numberId) {
      throw new BadRequestException('Linha não possui appId ou numberId configurados');
    }

    const app = await this.prisma.app.findFirst({
      where: { id: line.appId, tenantId },
    });

    if (!app) {
      throw new BadRequestException(`App com ID ${line.appId} não encontrado`);
    }

    try {
      const isValid = await this.whatsappCloudService.validateCredentials(
        app.accessToken,
        line.numberId,
      );

      return {
        connected: isValid,
        message: isValid
          ? 'Linha conectada e funcionando'
          : 'Linha não conectada - verifique as credenciais do app',
      };
    } catch (error) {
      return {
        connected: false,
        message: `Erro ao testar conexão: ${error.message}`,
      };
    }
  }

  async update(tenantId: string, id: number, updateLineDto: UpdateLineDto) {
    const currentLine = await this.findOne(tenantId, id);

    if (updateLineDto.receiveMedia !== undefined && updateLineDto.receiveMedia !== currentLine.receiveMedia) {
      await this.updateWebhookConfig(currentLine, updateLineDto.receiveMedia);
    }

    const { phone, appId, numberId, segment, lineStatus, receiveMedia } = updateLineDto;
    const updateData: any = {};

    if (phone !== undefined) updateData.phone = phone;
    if (appId !== undefined) {
      const app = await this.prisma.app.findFirst({
        where: { id: appId, tenantId },
      });
      if (!app) {
        throw new BadRequestException(`App com ID ${appId} não encontrado`);
      }
      updateData.appId = appId;
    }
    if (numberId !== undefined) updateData.numberId = numberId;
    if (segment !== undefined && segment !== currentLine.segment) {
      const defaultSegment = await this.prisma.segment.findFirst({
        where: { name: 'Padrão', tenantId },
      });

      if (currentLine.segment !== defaultSegment?.id) {
        throw new BadRequestException('Esta linha já possui um segmento fixo e não pode ser alterada. Apenas linhas do segmento "Padrão" permitem troca.');
      }

      updateData.segment = segment;
    }

    if (lineStatus !== undefined) updateData.lineStatus = lineStatus;
    if (receiveMedia !== undefined) updateData.receiveMedia = receiveMedia;

    return this.prisma.linesStock.update({
      where: { id },
      data: updateData,
    });
  }

  private async updateWebhookConfig(line: any, enableBase64: boolean) {
    // Webhook é configurado via Meta Business API; nada a fazer aqui.
  }

  async remove(tenantId: string, id: number) {
    await this.findOne(tenantId, id);

    return this.prisma.linesStock.delete({
      where: { id },
    });
  }

  /**
   * Lógica automática de troca de linhas banidas. Pode ser chamada
   * tanto do controller (com tenant do JWT) quanto do webhook handler
   * (com tenant resolvido via App).
   */
  async handleBannedLine(tenantId: string, lineId: number) {
    const line = await this.findOne(tenantId, lineId);

    const lineOperators = await this.prisma.lineOperator.findMany({
      where: { lineId },
      include: {
        user: true,
      },
    });

    await this.update(tenantId, lineId, { lineStatus: 'ban' });

    await this.systemEventsService.logEvent(
      EventType.LINE_BANNED,
      EventModule.LINES,
      {
        lineId: line.id,
        linePhone: line.phone,
      },
      null,
      EventSeverity.ERROR,
      tenantId,
    );

    await this.prisma.lineOperator.deleteMany({
      where: { lineId },
    });

    const availableLine = await this.prisma.linesStock.findFirst({
      where: {
        tenantId,
        lineStatus: 'active',
        segment: line.segment,
      },
    });

    if (availableLine) {
      const updatedCount = await this.prisma.conversation.updateMany({
        where: {
          tenantId,
          userLine: lineId,
          tabulation: null,
        },
        data: {
          userLine: availableLine.id,
        },
      });
      console.log(`🔄 [handleBannedLine] ${updatedCount.count} conversas migradas da linha banida ${line.phone} para a linha ${availableLine.phone}`);
    } else {
      console.warn(`⚠️ [handleBannedLine] Nenhuma outra linha disponível no segmento ${line.segment} para migrar conversas.`);
    }
  }

  async getAvailableLines(tenantId: string, segment: number) {
    this.requireTenant(tenantId);
    return this.prisma.linesStock.findMany({
      where: {
        tenantId,
        lineStatus: 'active',
        segment,
        linkedTo: null,
      },
    });
  }

  /**
   * Retorna linhas disponíveis para um segmento (sem necessidade de vinculação)
   */
  async getAvailableLinesForSegment(tenantId: string, segmentId: number): Promise<any[]> {
    this.requireTenant(tenantId);
    return this.prisma.linesStock.findMany({
      where: {
        tenantId,
        lineStatus: 'active',
        segment: segmentId,
      },
      include: {
        operators: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        phone: 'asc',
      },
    });
  }

  async getActivatorsProductivity(tenantId: string) {
    this.requireTenant(tenantId);
    const productivity = await this.prisma.linesStock.groupBy({
      by: ['createdBy'],
      _count: {
        id: true,
      },
      where: {
        tenantId,
        createdBy: { not: null },
      },
    });

    const userIds = productivity.map(p => p.createdBy).filter((id): id is number => id !== null);
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        tenants: { some: { tenantId } },
      },
      select: { id: true, name: true },
    });
    const usersMap = new Map(users.map(u => [u.id, u.name]));

    return productivity.map(p => ({
      activatorId: p.createdBy,
      activatorName: (p.createdBy && usersMap.get(p.createdBy)) || 'Desconhecido',
      count: p._count.id,
    }));
  }

  async getLinesAllocationStats(tenantId: string) {
    this.requireTenant(tenantId);
    const lines = await this.prisma.linesStock.findMany({
      where: { tenantId },
      include: {
        operators: true,
      },
    });

    return {
      total: lines.length,
      active: lines.filter(l => l.lineStatus === 'active').length,
      banned: lines.filter(l => l.lineStatus === 'ban').length,
      allocated: lines.filter(l => l.operators.length > 0).length,
      unallocated: lines.filter(l => l.operators.length === 0).length,
    };
  }

  /**
   * Distribui mensagem inbound de forma inteligente baseado em:
   * - Conversa existente (sticky)
   * - Carga de trabalho
   * - Tempo logado
   *
   * `tenantId` é resolvido pelo caller (webhook handler trusted) e
   * todas as queries são escopadas — incluindo a recuperação dos
   * operadores online.
   */
  async distributeInboundMessage(tenantId: string, lineId: number, contactPhone: string): Promise<number | null> {
    this.requireTenant(tenantId);

    const line = await this.prisma.linesStock.findFirst({
      where: { id: lineId, tenantId },
    });

    if (!line || !line.segment) {
      console.warn(`⚠️ [LinesService] Linha ${lineId} não encontrada ou sem segmento`);
      return null;
    }

    // Operadores online do segmento, restritos ao tenant via UserTenant.
    const segmentOperators = await this.prisma.user.findMany({
      where: {
        role: 'operator',
        status: 'Online',
        segment: line.segment,
        tenants: { some: { tenantId } },
      },
    });

    const phoneVariants = [contactPhone];
    if (contactPhone.startsWith('55') && contactPhone.length > 11) {
      phoneVariants.push(contactPhone.substring(2));
    } else if (!contactPhone.startsWith('55')) {
      phoneVariants.push(`55${contactPhone}`);
    }

    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        contactPhone: { in: phoneVariants },
        userLine: lineId,
        tabulation: null,
        userId: { not: null },
      },
      orderBy: {
        datetime: 'desc',
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (existingConversation?.userId) {
      return existingConversation.userId;
    }

    if (segmentOperators.length === 0) {
      return null;
    }

    const MAX_CONVERSATIONS_PER_OPERATOR = 15;

    const operatorPriorities = await Promise.all(
      segmentOperators.map(async (operator) => {
        const activeConversationsRaw = await this.prisma.conversation.groupBy({
          by: ['contactPhone'],
          where: {
            tenantId,
            userId: operator.id,
            tabulation: null,
          },
        });
        const activeConversations = activeConversationsRaw.length;

        const connectionTime = this.websocketGateway.getOperatorConnectionTime(operator.id);
        const timeLogged = connectionTime ? Date.now() - connectionTime : 0;

        return {
          operatorId: operator.id,
          operatorName: operator.name,
          activeConversations,
          timeLogged,
          hasCapacity: activeConversations < MAX_CONVERSATIONS_PER_OPERATOR,
        };
      })
    );

    const operatorsWithCapacity = operatorPriorities.filter(op => op.hasCapacity);

    if (operatorsWithCapacity.length === 0) {
      return null;
    }

    operatorsWithCapacity.sort((a, b) => {
      if (a.activeConversations !== b.activeConversations) {
        return a.activeConversations - b.activeConversations;
      }
      return b.timeLogged - a.timeLogged;
    });

    return operatorsWithCapacity[0].operatorId;
  }
}
