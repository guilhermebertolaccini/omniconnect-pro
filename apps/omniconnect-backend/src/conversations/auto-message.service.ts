import { Injectable, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { HumanizationService } from '../humanization/humanization.service';
import { RateLimitingService } from '../rate-limiting/rate-limiting.service';
import { SpintaxService } from '../spintax/spintax.service';
import { LineReputationService } from '../line-reputation/line-reputation.service';
import { MessageSendingService } from '../message-sending/message-sending.service';

/**
 * Serviço para enviar mensagens automáticas quando cliente não responde
 * DESATIVADO por padrão - não será executado até ser ativado no painel de controle
 */
@Injectable()
export class AutoMessageService implements OnModuleInit {
  private autoMessageInterval: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private controlPanelService: ControlPanelService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    private humanizationService: HumanizationService,
    private rateLimitingService: RateLimitingService,
    private spintaxService: SpintaxService,
    private lineReputationService: LineReputationService,
    private messageSendingService: MessageSendingService,
  ) {}

  onModuleInit() {
    // Randomizar intervalo: executa a cada 50-70 minutos (não sempre na hora cheia)
    this.scheduleNextRun();
  }

  private scheduleNextRun() {
    // Limpar intervalo anterior se existir
    if (this.autoMessageInterval) {
      clearTimeout(this.autoMessageInterval);
    }

    // Calcular delay aleatório entre 50-70 minutos
    const randomMinutes = Math.random() * (70 - 50) + 50;
    const delayMs = randomMinutes * 60 * 1000;

    console.log(`⏰ [AutoMessage] Próxima execução agendada em ${Math.round(randomMinutes)} minutos`);

    this.autoMessageInterval = setTimeout(() => {
      this.checkAndSendAutoMessages();
      this.scheduleNextRun(); // Agendar próxima execução
    }, delayMs);
  }

  /**
   * Job que verifica conversas sem resposta e envia mensagem automática
   * Executa em intervalos aleatórios (50-70 minutos) para parecer mais humano
   * DESATIVADO: Só executa se autoMessageEnabled estiver true no painel de controle
   */
  async checkAndSendAutoMessages() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const tenant of tenants) {
      await this.checkAndSendAutoMessagesForTenant(tenant.id);
    }
  }

  private async checkAndSendAutoMessagesForTenant(tenantId: string) {
    try {
      // Buscar configuração global
      const globalConfig = await this.controlPanelService.findOne(tenantId);

      // Se não estiver ativado, não fazer nada
      if (!globalConfig.autoMessageEnabled) {
        return;
      }

      const hoursThreshold = globalConfig.autoMessageHours || 24;
      const messageText = globalConfig.autoMessageText || 'Oi, ainda está aí?';
      const maxAttempts = globalConfig.autoMessageMaxAttempts || 1;

      if (!messageText) {
        console.log('⚠️ [AutoMessage] Mensagem automática ativada mas sem texto configurado');
        return;
      }

      // Calcular data limite (H horas atrás)
      const thresholdDate = new Date();
      thresholdDate.setHours(thresholdDate.getHours() - hoursThreshold);

      // Buscar conversas ativas (não tabuladas) onde:
      // 1. Última mensagem é do operador (sender = 'operator')
      // 2. Última mensagem foi há mais de H horas
      // 3. Cliente não respondeu após a última mensagem do operador
      const conversations = await this.prisma.conversation.findMany({
        where: {
          tenantId,
          tabulation: null, // Apenas conversas ativas
          userId: { not: null }, // Tem operador atribuído
        },
        orderBy: {
          datetime: 'desc',
        },
      });

      // Agrupar por contactPhone e userId para pegar a última mensagem de cada conversa
      const conversationsByContact = new Map<string, any>();
      
      for (const conv of conversations) {
        const key = `${conv.contactPhone}_${conv.userId}`;
        if (!conversationsByContact.has(key)) {
          conversationsByContact.set(key, conv);
        }
      }

      let sentCount = 0;

      for (const [key, lastMessage] of conversationsByContact.entries()) {
        // Verificar se a última mensagem é do operador
        if (lastMessage.sender !== 'operator') {
          continue;
        }

        // Verificar se passou o tempo limite
        if (new Date(lastMessage.datetime) > thresholdDate) {
          continue;
        }

        // Verificar se o cliente respondeu após a última mensagem do operador
        const hasResponse = await this.prisma.conversation.findFirst({
          where: {
            tenantId,
            contactPhone: lastMessage.contactPhone,
            userId: lastMessage.userId,
            sender: 'contact',
            datetime: { gt: lastMessage.datetime },
          },
        });

        if (hasResponse) {
          // Cliente já respondeu, não enviar
          continue;
        }

        // Verificar quantas vezes já foi enviada mensagem automática para este contato
        const autoMessagesSent = await this.prisma.conversation.count({
          where: {
            tenantId,
            contactPhone: lastMessage.contactPhone,
            userId: lastMessage.userId,
            message: messageText, // Mesma mensagem automática
            sender: 'operator',
            datetime: { gte: lastMessage.datetime }, // Após a última mensagem do operador
          },
        });

        if (autoMessagesSent >= maxAttempts) {
          // Já atingiu o limite de tentativas
          continue;
        }

        // Buscar operador e linha
        const operator = await this.prisma.user.findUnique({
          where: { id: lastMessage.userId! },
          include: {
            lineOperators: {
              where: { tenantId },
              include: {
                line: true,
              },
            },
          },
        });

        if (!operator || operator.lineOperators.length === 0) {
          continue;
        }

        const line = operator.lineOperators[0].line;

        if (!line || line.lineStatus !== 'active') {
          continue;
        }

        // Rate Limiting: Verificar se a linha pode enviar mensagem
        const canSend = await this.rateLimitingService.canSendMessage(line.id);
        if (!canSend) {
          console.warn(`⚠️ [AutoMessage] Linha ${line.phone} atingiu limite de mensagens, pulando mensagem automática`);
          continue;
        }

        // Humanização: Delay antes de enviar mensagem automática
        const messageLength = messageText.length;
        const humanizedDelay = await this.humanizationService.getHumanizedDelay(messageLength, false);
        await this.humanizationService.sleep(humanizedDelay);

        // Enviar mensagem automática via WebSocket (simulando envio do operador)
        try {
          // Criar conversa com a mensagem automática
          await this.prisma.conversation.create({
            data: {
              tenantId,
              contactPhone: lastMessage.contactPhone,
              contactName: lastMessage.contactName,
              segment: lastMessage.segment,
              userName: operator.name,
              userLine: line.id,
              userId: operator.id,
              message: messageText,
              sender: 'operator',
              messageType: 'text',
            },
            select: {
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
            },
          });

          // Buscar o App para obter o accessToken
          const app = await this.prisma.app.findFirst({
            where: { id: line.appId, tenantId },
          });

          if (!app || !app.accessToken) {
            console.warn(`⚠️ [AutoMessage] Linha ${line.phone} não possui app ou accessToken`);
            continue;
          }

          // Enviar via WhatsApp Cloud API
          const sendResult = await this.messageSendingService.sendMessage({
            phoneNumberId: line.numberId,
            token: app.accessToken,
            contactPhone: lastMessage.contactPhone,
            message: messageText,
            messageType: 'text',
            traceId: `auto-message-${lastMessage.contactPhone}`,
          });

          if (sendResult.success) {
            sentCount++;
            console.log(`✅ [AutoMessage] Mensagem automática enviada para ${lastMessage.contactPhone} (operador: ${operator.name})`);
          } else {
            console.error(`❌ [AutoMessage] Erro ao enviar: ${sendResult.error}`);
          }
        } catch (error) {
          console.error(`❌ [AutoMessage] Erro ao enviar mensagem automática para ${lastMessage.contactPhone}:`, error);
        }
      }

      if (sentCount > 0) {
        console.log(`📤 [AutoMessage] ${sentCount} mensagem(ns) automática(s) enviada(s)`);
      }
    } catch (error) {
      console.error('❌ [AutoMessage] Erro ao processar mensagens automáticas:', error);
    }
  }
}
