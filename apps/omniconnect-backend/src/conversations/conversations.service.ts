import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';

const CONVERSATION_SELECT = {
  id: true,
  contactName: true,
  contactPhone: true,
  segment: true,
  userName: true,
  userLine: true,
  userId: true,
  message: true,
  sender: true,
  datetime: true,
  tabulation: true,
  messageType: true,
  mediaUrl: true,
  archived: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
  ) { }

  private requireTenant(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
  }

  async create(tenantId: string, createConversationDto: CreateConversationDto) {
    this.requireTenant(tenantId);
    const conversation = await this.prisma.conversation.create({
      data: {
        ...createConversationDto,
        tenantId,
        datetime: createConversationDto.datetime || new Date(),
      },
      select: CONVERSATION_SELECT,
    });
    return conversation;
  }

  async findAll(tenantId: string, filters?: any) {
    this.requireTenant(tenantId);
    const { search, ...validFilters } = filters || {};

    const where: any = search
      ? {
        ...validFilters,
        tenantId,
        OR: [
          { contactName: { contains: search, mode: 'insensitive' } },
          { contactPhone: { contains: search } },
          { message: { contains: search, mode: 'insensitive' } },
        ],
      }
      : { ...validFilters, tenantId };

    return this.prisma.conversation.findMany({
      where,
      orderBy: { datetime: 'desc' },
      select: CONVERSATION_SELECT,
    });
  }

  /**
   * Busca conversas filtrando por domínio de email dos operadores
   * (supervisor mode). Sempre escopado por tenant.
   */
  async findAllByEmailDomain(tenantId: string, filters: any, emailDomain: string) {
    this.requireTenant(tenantId);
    const { search, ...validFilters } = filters || {};

    const usersWithSameDomain = await this.prisma.user.findMany({
      where: {
        email: { endsWith: `@${emailDomain}` },
        tenants: { some: { tenantId } },
      },
      select: { id: true },
    });

    const userIds = usersWithSameDomain.map((u) => u.id);
    if (userIds.length === 0) {
      return [];
    }

    const baseWhere: any = {
      ...validFilters,
      tenantId,
      userId: { in: userIds },
    };

    const where = search
      ? {
        ...baseWhere,
        OR: [
          { contactName: { contains: search, mode: 'insensitive' } },
          { contactPhone: { contains: search } },
          { message: { contains: search, mode: 'insensitive' } },
        ],
      }
      : baseWhere;

    return this.prisma.conversation.findMany({
      where,
      orderBy: { datetime: 'desc' },
      select: CONVERSATION_SELECT,
    });
  }

  async findByContactPhone(tenantId: string, contactPhone: string, tabulated: boolean = false, userLine?: number) {
    this.requireTenant(tenantId);
    const where: any = {
      tenantId,
      contactPhone,
      tabulation: tabulated ? { not: null } : null,
    };
    if (userLine) {
      where.userLine = userLine;
    }

    return this.prisma.conversation.findMany({
      where,
      orderBy: { datetime: 'asc' },
      select: CONVERSATION_SELECT,
    });
  }

  async findActiveConversations(
    tenantId: string,
    userLine?: number,
    userId?: number,
    daysToFilter: number = 3,
    segmentId?: number,
  ) {
    this.requireTenant(tenantId);
    const where: any = {
      tenantId,
      tabulation: null,
    };

    const dateLimitMs = Date.now() - (daysToFilter * 24 * 60 * 60 * 1000);
    where.datetime = { gte: new Date(dateLimitMs) };

    if (userId && segmentId) {
      where.OR = [
        { userId },
        { userId: null, segment: segmentId },
      ];
    } else if (userId) {
      where.userId = userId;
    } else if (userLine) {
      where.userLine = userLine;
    }

    return this.prisma.conversation.findMany({
      where,
      orderBy: { datetime: 'asc' },
      select: CONVERSATION_SELECT,
    });
  }

  private readonly MAX_CONVERSATIONS_PER_OPERATOR = 15;

  async getActiveConversationCount(tenantId: string, userId: number): Promise<number> {
    this.requireTenant(tenantId);
    const count = await this.prisma.conversation.groupBy({
      by: ['contactPhone'],
      where: {
        tenantId,
        userId,
        tabulation: null,
      },
    });
    return count.length;
  }

  /**
   * Reclama (claim) um lote de conversas sem dono do segmento. Sempre
   * escopado por tenant (operador só pode pegar conversas do próprio
   * tenant — caso esteja em múltiplos, o caller decide qual).
   */
  async claimPendingConversations(
    tenantId: string,
    userId: number,
    segmentId: number,
    operatorName: string,
    limit: number = 3,
  ): Promise<number> {
    this.requireTenant(tenantId);
    const currentCount = await this.getActiveConversationCount(tenantId, userId);
    const availableSlots = this.MAX_CONVERSATIONS_PER_OPERATOR - currentCount;
    if (availableSlots <= 0) return 0;

    const effectiveLimit = Math.min(limit, availableSlots);
    const pendingConversations = await this.prisma.conversation.findMany({
      where: {
        tenantId,
        userId: null,
        segment: segmentId,
        tabulation: null,
      },
      distinct: ['contactPhone'],
      orderBy: { datetime: 'asc' },
      take: effectiveLimit,
      select: { contactPhone: true },
    });

    if (pendingConversations.length === 0) return 0;

    const phonesToClaim = pendingConversations.map((c) => c.contactPhone);
    const result = await this.prisma.conversation.updateMany({
      where: {
        tenantId,
        contactPhone: { in: phonesToClaim },
        userId: null,
        segment: segmentId,
        tabulation: null,
      },
      data: { userId, userName: operatorName },
    });

    console.log(`✅ [ClaimPending] ${result.count} mensagens atualizadas para ${operatorName}`);
    return phonesToClaim.length;
  }

  async findTabulatedConversations(
    tenantId: string,
    userLine?: number,
    userId?: number,
    daysToFilter: number = 3,
  ) {
    this.requireTenant(tenantId);
    const where: any = {
      tenantId,
      tabulation: { not: null },
    };

    if (userId) {
      where.userId = userId;
    } else if (userLine) {
      where.userLine = userLine;
    }

    const dateLimitMs = Date.now() - (daysToFilter * 24 * 60 * 60 * 1000);
    where.datetime = { gte: new Date(dateLimitMs) };

    return this.prisma.conversation.findMany({
      where,
      orderBy: { datetime: 'asc' },
      select: CONVERSATION_SELECT,
    });
  }

  async findOne(tenantId: string, id: number) {
    this.requireTenant(tenantId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      select: CONVERSATION_SELECT,
    });

    if (!conversation) {
      throw new NotFoundException(`Conversa com ID ${id} não encontrada`);
    }

    return conversation;
  }

  async update(tenantId: string, id: number, updateConversationDto: UpdateConversationDto) {
    await this.findOne(tenantId, id);

    return this.prisma.conversation.update({
      where: { id },
      data: updateConversationDto,
      select: CONVERSATION_SELECT,
    });
  }

  async tabulateConversation(tenantId: string, contactPhone: string, tabulationId: number, userLine?: number) {
    this.requireTenant(tenantId);
    const where: any = {
      tenantId,
      contactPhone,
      tabulation: null,
    };
    if (userLine !== undefined && userLine !== null) {
      where.userLine = userLine;
    }

    return this.prisma.conversation.updateMany({
      where,
      data: { tabulation: tabulationId },
    });
  }

  async remove(tenantId: string, id: number) {
    await this.findOne(tenantId, id);
    return this.prisma.conversation.delete({ where: { id } });
  }

  /**
   * Deletar todas as conversas de um contato (apenas admin/digital).
   * Sempre escopado por tenant para evitar varredura cross-tenant.
   */
  async deleteByContactPhone(tenantId: string, contactPhone: string) {
    this.requireTenant(tenantId);
    const result = await this.prisma.conversation.deleteMany({
      where: { tenantId, contactPhone },
    });

    return {
      success: true,
      deleted: result.count,
      contactPhone,
      message: `${result.count} conversas deletadas com sucesso`,
    };
  }

  async getConversationsBySegment(tenantId: string, segment: number, tabulated: boolean = false) {
    this.requireTenant(tenantId);
    return this.prisma.conversation.findMany({
      where: {
        tenantId,
        segment,
        tabulation: tabulated ? { not: null } : null,
      },
      orderBy: { datetime: 'desc' },
    });
  }

  /**
   * Rechamar contato após linha banida. Cria uma nova conversa ativa.
   */
  async recallContact(tenantId: string, contactPhone: string, userId: number, userLine: number | null) {
    this.requireTenant(tenantId);
    if (!userLine) {
      throw new NotFoundException('Operador não possui linha atribuída');
    }

    const contact = await this.prisma.contact.findFirst({
      where: { tenantId, phone: contactPhone },
    });

    if (!contact) {
      throw new NotFoundException('Contato não encontrado');
    }

    const lastConversation = await this.prisma.conversation.findFirst({
      where: { tenantId, contactPhone },
      orderBy: { datetime: 'desc' },
    });

    const operator = await this.prisma.user.findFirst({
      where: { id: userId, tenants: { some: { tenantId } } },
    });

    if (!operator) {
      throw new NotFoundException('Operador não encontrado');
    }

    const newConversation = await this.prisma.conversation.create({
      data: {
        tenantId,
        contactName: contact.name,
        contactPhone: contact.phone,
        segment: contact.segment || lastConversation?.segment || operator.segment,
        userName: operator.name,
        userLine,
        userId,
        message: 'Contato rechamado após linha banida',
        sender: 'operator',
        messageType: 'text',
        tabulation: null,
      },
      select: CONVERSATION_SELECT,
    });

    return newConversation;
  }

  /**
   * Transfere todas as conversas ativas de um contato para outro
   * operador. Sempre escopado por tenant — supervisor não pode
   * transferir para fora do próprio tenant.
   */
  async transferConversation(
    tenantId: string,
    contactPhone: string,
    targetOperatorId: number,
    currentUser: any,
  ) {
    this.requireTenant(tenantId);
    if (currentUser.role !== 'supervisor' && currentUser.role !== 'admin') {
      throw new ForbiddenException('Apenas supervisores podem transferir conversas');
    }

    const targetOperator = await this.prisma.user.findFirst({
      where: {
        id: targetOperatorId,
        tenants: { some: { tenantId } },
      },
    });

    if (!targetOperator || targetOperator.role !== 'operator') {
      throw new ForbiddenException('Operador destino não encontrado ou inválido');
    }

    if (currentUser.role === 'supervisor' && currentUser.segment !== targetOperator.segment) {
      throw new ForbiddenException('Operador destino deve estar no mesmo segmento');
    }

    const activeConversations = await this.prisma.conversation.findMany({
      where: {
        tenantId,
        contactPhone,
        tabulation: null,
      },
    });

    if (activeConversations.length === 0) {
      throw new NotFoundException('Nenhuma conversa ativa encontrada para este contato');
    }

    const firstConversation = activeConversations[0];

    const updatedConversations = await this.prisma.$transaction(
      activeConversations.map((conversation) =>
        this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            userId: targetOperatorId,
            userName: targetOperator.name,
          },
        }),
      ),
    );

    if (firstConversation.userId) {
      this.websocketGateway.emitToUser(firstConversation.userId, 'conversation-transferred', {
        contactPhone,
        toOperatorId: targetOperatorId,
        toOperatorName: targetOperator.name,
      });
    }

    this.websocketGateway.emitToUser(targetOperatorId, 'conversation-received', {
      contactPhone,
      contactName: activeConversations[0]?.contactName || 'Contato',
      fromOperatorId: firstConversation.userId,
    });

    if (updatedConversations.length > 0) {
      const updatedConversation = updatedConversations[0];
      await this.websocketGateway.emitNewMessage({
        ...updatedConversation,
        contactPhone,
      });
    }

    return {
      success: true,
      transferred: updatedConversations.length,
      contactPhone,
      fromOperatorId: firstConversation.userId,
      toOperatorId: targetOperatorId,
      toOperatorName: targetOperator.name,
    };
  }
}
