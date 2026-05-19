import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { formatQueueMessageWithTriage } from './format-queue-message-with-triage';
import { ConversationsService } from '../conversations/conversations.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class MessageQueueService {
  constructor(
    private prisma: PrismaService,
    private conversationsService: ConversationsService,
    private websocketGateway: WebsocketGateway,
  ) {}

  /**
   * Adiciona mensagem à fila quando não há operador online.
   * `tenantId` é obrigatório e deve vir resolvido pelo caller (webhook
   * resolveu via App, ou request autenticado já tem o user).
   */
  async addToQueue(
    tenantId: string,
    contactPhone: string,
    contactName: string,
    message: string,
    messageType: string = 'text',
    mediaUrl?: string,
    segment?: number,
  ) {
    if (!tenantId) {
      throw new Error('MessageQueueService.addToQueue requires tenantId');
    }
    return await this.prisma.messageQueue.create({
      data: {
        tenantId,
        contactPhone,
        contactName,
        message,
        messageType,
        mediaUrl,
        segment,
        status: 'pending',
      },
    });
  }

  /**
   * Processa mensagens pendentes quando operador fica online.
   * O tenantId é resolvido per-message a partir do próprio registro
   * (`MessageQueue.tenantId` é confiável pois foi gravado no enqueue).
   * Adicionalmente, escopamos a query inicial pelo tenant do operador
   * para impedir cross-tenant pickup.
   */
  async processPendingMessages(operatorId: number, operatorSegment?: number) {
    // Recuperar tenants do operador (mantemos compatibilidade com cenários
    // mono-tenant onde o operador só está em 1 tenant).
    const operator = await this.prisma.user.findUnique({
      where: { id: operatorId },
      include: { tenants: { select: { tenantId: true } } },
    });
    const operatorTenantIds = operator?.tenants?.map(t => t.tenantId) || [];

    const whereClause: any = {
      status: 'pending',
    };
    if (operatorTenantIds.length > 0) {
      whereClause.tenantId = { in: operatorTenantIds };
    }
    if (operatorSegment) {
      whereClause.segment = operatorSegment;
    }

    const pendingMessages = await this.prisma.messageQueue.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const queuedMessage of pendingMessages) {
      try {
        // Marcar como processando
        await this.prisma.messageQueue.update({
          where: { id: queuedMessage.id },
          data: { status: 'processing', attempts: { increment: 1 } },
        });

        // tenantId já foi gravado no enqueue — é a fonte da verdade aqui.
        const tenantId = queuedMessage.tenantId;

        // Criar conversa e enviar mensagem via WebSocket
        await this.conversationsService.create(tenantId, {
          contactPhone: queuedMessage.contactPhone,
          contactName: queuedMessage.contactName || queuedMessage.contactPhone,
          message: formatQueueMessageWithTriage(
            queuedMessage.message,
            queuedMessage.leadSummary,
          ),
          sender: 'contact',
          messageType: queuedMessage.messageType,
          mediaUrl: queuedMessage.mediaUrl,
          segment: queuedMessage.segment,
          userId: operatorId,
        });

        // Marcar como enviada
        await this.prisma.messageQueue.update({
          where: { id: queuedMessage.id },
          data: {
            status: 'sent',
            processedAt: new Date(),
          },
        });

        // Notificar operador via WebSocket sobre nova mensagem na fila
        this.websocketGateway.emitToUser(operatorId, 'queued-message-processed', {
          messageId: queuedMessage.id,
          contactPhone: queuedMessage.contactPhone,
        });
      } catch (error) {
        console.error(`❌ [MessageQueue] Erro ao processar mensagem ${queuedMessage.id}:`, error);
        
        // Marcar como falha se exceder 3 tentativas
        if (queuedMessage.attempts >= 3) {
          await this.prisma.messageQueue.update({
            where: { id: queuedMessage.id },
            data: {
              status: 'failed',
              errorMessage: error.message,
            },
          });
        } else {
          // Voltar para pending para tentar novamente
          await this.prisma.messageQueue.update({
            where: { id: queuedMessage.id },
            data: { status: 'pending' },
          });
        }
      }
    }

    return pendingMessages.length;
  }

  /**
   * Verifica se há operadores online para processar mensagens
   */
  async checkAndProcessQueue() {
    // Buscar operadores online
    const onlineOperators = await this.prisma.user.findMany({
      where: {
        role: 'operator',
        status: 'Online',
      },
      include: {
        lineOperators: true,
      },
    });

    // Processar mensagens para cada operador online
    for (const operator of onlineOperators) {
      if (operator.lineOperators.length > 0) {
        // Operador tem linha, pode processar mensagens
        await this.processPendingMessages(operator.id, operator.segment || undefined);
      }
    }
  }

  /**
   * Scheduler para reprocessar mensagens pendentes antigas (há mais de 5 minutos)
   * Executa a cada 5 minutos
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processOldPendingMessages() {
    console.log('🔄 [MessageQueue] Verificando mensagens pendentes antigas...');
    
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    try {
      const oldPendingMessages = await this.prisma.messageQueue.findMany({
        where: {
          status: 'pending',
          createdAt: { lte: fiveMinutesAgo },
        },
        orderBy: { createdAt: 'asc' },
        take: 50, // Processar até 50 por vez
      });

      if (oldPendingMessages.length === 0) {
        return;
      }

      console.log(`📋 [MessageQueue] Encontradas ${oldPendingMessages.length} mensagens pendentes antigas para reprocessar`);

      // Buscar operadores online para processar
      const onlineOperators = await this.prisma.user.findMany({
        where: {
          role: 'operator',
          status: 'Online',
        },
        include: {
          lineOperators: true,
        },
      });

      // Processar mensagens para cada operador online
      for (const operator of onlineOperators) {
        if (operator.lineOperators.length > 0) {
          await this.processPendingMessages(operator.id, operator.segment || undefined);
        }
      }

      console.log(`✅ [MessageQueue] Reprocessamento de mensagens antigas concluído`);
    } catch (error) {
      console.error('❌ [MessageQueue] Erro ao reprocessar mensagens pendentes antigas:', error);
    }
  }
}

