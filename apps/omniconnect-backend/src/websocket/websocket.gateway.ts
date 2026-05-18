import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { MediaService } from '../media/media.service';
import { LinesService } from '../lines/lines.service';
import { SystemEventsService, EventType, EventModule, EventSeverity } from '../system-events/system-events.service';
import { HumanizationService } from '../humanization/humanization.service';
import { RateLimitingService } from '../rate-limiting/rate-limiting.service';
import { SpintaxService } from '../spintax/spintax.service';
import { HealthCheckCacheService } from '../health-check-cache/health-check-cache.service';
import { LineReputationService } from '../line-reputation/line-reputation.service';
import { PhoneValidationService } from '../phone-validation/phone-validation.service';
import { MessageValidationService } from '../message-validation/message-validation.service';
import { MessageSendingService } from '../message-sending/message-sending.service';
import { AppLoggerService } from '../logger/logger.service';
import { WhatsappCloudService } from '../whatsapp-cloud/whatsapp-cloud.service';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
        : ['http://localhost:5173', 'http://localhost:3001'];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<number, string> = new Map();
  private operatorConnectionTime: Map<number, number> = new Map(); // userId -> timestamp de conexão

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => ConversationsService))
    private conversationsService: ConversationsService,
    private controlPanelService: ControlPanelService,
    private mediaService: MediaService,
    @Inject(forwardRef(() => LinesService))
    private linesService: LinesService,
    private systemEventsService: SystemEventsService,
    private humanizationService: HumanizationService,
    private rateLimitingService: RateLimitingService,
    private spintaxService: SpintaxService,
    private healthCheckCacheService: HealthCheckCacheService,
    private lineReputationService: LineReputationService,
    private phoneValidationService: PhoneValidationService,
    private messageValidationService: MessageValidationService,
    private messageSendingService: MessageSendingService,
    private logger: AppLoggerService,
    private whatsappCloudService: WhatsappCloudService,
  ) { }

  async handleConnection(client: Socket) {
    try {
      console.log(`[WebSocket] Nova tentativa de conexão: ${client.id}`);
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        console.warn(`[WebSocket] Conexão rejeitada: Token não fornecido (socket: ${client.id})`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const user = await (this.prisma as any).user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        console.warn(`[WebSocket] Conexão rejeitada: Usuário não encontrado para token (sub: ${payload.sub})`);
        client.disconnect();
        return;
      }

      client.data.user = user;
      this.connectedUsers.set(user.id, client.id);
      this.operatorConnectionTime.set(user.id, Date.now()); // Rastrear tempo de conexão

      console.log(`[WebSocket] Usuário ${user.name} (ID: ${user.id}) conectado e adicionado ao mapa. Socket: ${client.id}`);
      console.log(`[WebSocket] Total de usuários conectados: ${this.connectedUsers.size}`);

      // Atualizar status do usuário para Online
      await (this.prisma as any).user.update({
        where: { id: user.id },
        data: { status: 'Online' },
      });

      // Log apenas para operadores (fluxo principal)
      if (user.role === 'operator') {
        console.log(`✅ Operador ${user.name} conectado`);
      }

      // Enviar conversas ativas ao conectar (apenas para operators)
      // Buscar por userId mesmo se não tiver linha, pois as conversas estão vinculadas ao operador
      if (user.role === 'operator') {
        // Buscar conversas escopadas pelo tenant do JWT do socket.
        const activeConversations = await this.conversationsService.findActiveConversations(
          user.tenantId,
          undefined,
          user.id,
        );
        client.emit('active-conversations', activeConversations);

        // Processar mensagens pendentes na fila quando operador fica online
        try {
          // Buscar mensagens pendentes do segmento do operador
          const whereClause: any = { status: 'pending' };
          if (user.segment) {
            whereClause.segment = user.segment;
          }

          // Remover limite de 10 - processar todas as mensagens pendentes
          const pendingMessages = await (this.prisma as any).messageQueue.findMany({
            where: whereClause,
            orderBy: { createdAt: 'asc' },
            // Processar em lotes de 50 para não sobrecarregar
            take: 50,
          });

          for (const queuedMessage of pendingMessages) {
            try {
              await (this.prisma as any).messageQueue.update({
                where: { id: queuedMessage.id },
                data: { status: 'processing', attempts: { increment: 1 } },
              });

              // Criar conversa (tenant do operador conectado)
              await this.conversationsService.create((user as any).tenantId || 'default-tenant', {
                contactPhone: queuedMessage.contactPhone,
                contactName: queuedMessage.contactName || queuedMessage.contactPhone,
                message: queuedMessage.message,
                sender: 'contact',
                messageType: queuedMessage.messageType,
                mediaUrl: queuedMessage.mediaUrl,
                segment: queuedMessage.segment,
                userId: user.id,
                userLine: user.line,
              });

              await (this.prisma as any).messageQueue.update({
                where: { id: queuedMessage.id },
                data: { status: 'sent', processedAt: new Date() },
              });

              this.emitToUser(user.id, 'queued-message-processed', {
                messageId: queuedMessage.id,
                contactPhone: queuedMessage.contactPhone,
              });
            } catch (error) {
              console.error(`❌ [WebSocket] Erro ao processar mensagem ${queuedMessage.id}:`, error);
              if (queuedMessage.attempts >= 3) {
                await (this.prisma as any).messageQueue.update({
                  where: { id: queuedMessage.id },
                  data: { status: 'failed', errorMessage: error.message },
                });
              } else {
                await (this.prisma as any).messageQueue.update({
                  where: { id: queuedMessage.id },
                  data: { status: 'pending' },
                });
              }
            }
          }

        } catch (error) {
          console.error('❌ [WebSocket] Erro ao processar fila de mensagens:', error);
        }
      }
    } catch (error) {
      console.error('Erro na autenticação WebSocket:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    if (client.data.user) {
      const userId = client.data.user.id;

      try {
        // Atualizar status do usuário para Offline
        await this.prisma.user.update({
          where: { id: userId },
          data: { status: 'Offline' },
        });

        // Registrar evento de desconexão (tenant do user no socket).
        if (client.data.user.role === 'operator') {
          await this.systemEventsService.logEvent(
            EventType.OPERATOR_DISCONNECTED,
            EventModule.WEBSOCKET,
            { userId: userId, userName: client.data.user.name, email: client.data.user.email },
            userId,
            EventSeverity.INFO,
            client.data.user.tenantId,
          );
        }

        // Log apenas para operadores (fluxo principal)
        if (client.data.user.role === 'operator') {
          console.log(`❌ Operador ${client.data.user.name} desconectado`);
        }
      } catch (error) {
        console.error(`❌ [WebSocket] Erro ao atualizar status na desconexão:`, error);
      } finally {
        // SEMPRE remover do Map, mesmo com erro
        this.connectedUsers.delete(userId);
        this.operatorConnectionTime.delete(userId); // Remover rastreamento de tempo
      }
    }
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { contactPhone: string; message: string; messageType?: string; mediaUrl?: string; fileName?: string; isNewConversation?: boolean; lineId?: number },
  ) {
    const startTime = Date.now(); // Para métricas de latência
    const user = client.data.user;

    if (!user) {
      console.error('❌ [WebSocket] Usuário não autenticado');
      return { error: 'Usuário não autenticado' };
    }

    // Normalizar telefone (adicionar 55, remover caracteres especiais)
    data.contactPhone = this.phoneValidationService.normalizePhone(data.contactPhone);

    // Determinar qual linha usar
    let currentLineId: number | null = data.lineId || null;

    // Se não foi informada uma linha específica (ex: resposta a conversa existente)
    // IMPORTANTE: Buscar pela linha que RECEBEU a mensagem do cliente, não pelo operador
    if (!currentLineId) {
      const activeConversation = await (this.prisma as any).conversation.findFirst({
        where: {
          contactPhone: data.contactPhone,
          tabulation: null, // Apenas conversas ativas
          userLine: { not: null }, // Apenas conversas que têm linha associada
        },
        orderBy: { datetime: 'desc' },
      });

      if (activeConversation && activeConversation.userLine) {
        currentLineId = activeConversation.userLine;
        console.log(`ℹ️ [WebSocket] Usando linha da conversa existente (recebeu mensagem): ${currentLineId}`);
      }
    }

    // Se ainda não temos linha, tentar buscar qualquer linha ativa do segmento do operador (Pool)
    if (!currentLineId) {
      const availableLine = await (this.prisma as any).linesStock.findFirst({
        where: {
          segment: user.segment,
          lineStatus: 'active',
        },
      });

      if (availableLine) {
        currentLineId = availableLine.id;
        console.log(`ℹ️ [WebSocket] Usando linha do pool do segmento: ${currentLineId}`);
      }
    }

    // Se não encontrou nenhuma linha disponível
    if (!currentLineId) {
      console.error(`❌ [WebSocket] Nenhuma linha ativa encontrada no segmento ${user.segment} para o operador ${user.name}`);
      return { error: 'Nenhuma linha ativa disponível no seu segmento. Entre em contato com o administrador.' };
    }


    // Verificar se é uma nova conversa (1x1) e se o operador tem permissão
    if (data.isNewConversation) {
      const fullUser = await (this.prisma as any).user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          oneToOneActive: true,
        },
      });


      if (!fullUser?.oneToOneActive) {
        console.error('❌ [WebSocket] Operador sem permissão para 1x1');
        return { error: 'Você não tem permissão para iniciar conversas 1x1' };
      }

      // SEMPRE bloquear mensagens normais em nova conversa - primeira mensagem DEVE ser template
      console.error('❌ [WebSocket] Tentativa de enviar mensagem normal em nova conversa 1x1. Primeira mensagem deve ser template.');
      return { error: 'A primeira mensagem em uma nova conversa 1x1 deve ser enviada através de um template. Use a opção de criar nova conversa com template.' };
    }

    try {
      // Verificar CPC
      const cpcCheck = await this.controlPanelService.canContactCPC(data.contactPhone, user.segment);
      if (!cpcCheck.allowed) {
        return { error: cpcCheck.reason };
      }

      // Verificar repescagem
      const repescagemCheck = await this.controlPanelService.checkRepescagem(
        data.contactPhone,
        user.id,
        user.segment
      );
      if (!repescagemCheck.allowed) {
        return { error: repescagemCheck.reason };
      }

      // Validação de número: Verificar se o número é válido antes de enviar
      const phoneValidation = this.phoneValidationService.isValidFormat(data.contactPhone);
      if (!phoneValidation) {
        return { error: 'Número de telefone inválido' };
      }

      // Buscar linha atual do operador (sempre usar a linha atual, não a linha antiga da conversa)
      let line = await (this.prisma as any).linesStock.findUnique({
        where: { id: currentLineId },
      });

      if (!line || line.lineStatus !== 'active') {
        return { error: 'Linha não disponível' };
      }

      // Buscar o App para obter o accessToken
      let app = await (this.prisma as any).app.findUnique({
        where: { id: line.appId },
      });

      if (!app) {
        return { error: `App com ID ${line.appId} não encontrado` };
      }

      // Validar credenciais Cloud API
      if (!app.accessToken || !line.numberId) {
        return { error: 'Linha não possui accessToken do app ou numberId configurados' };
      }

      // Rate Limiting: Verificar se a linha pode enviar mensagem
      const canSend = await this.rateLimitingService.canSendMessage(currentLineId);
      if (!canSend) {
        return { error: 'Limite de mensagens atingido' };
      }

      // REMOVIDO: Delay de humanização - não é necessário para mensagens do operador
      // O delay de humanização deve ser usado apenas em campanhas massivas, não em mensagens normais do operador

      // Health check: Validar credenciais Cloud API (assíncrono, não bloqueia envio)
      // Executar em paralelo para não atrasar o envio
      const healthCheckPromise = this.whatsappCloudService.validateCredentials(
        app.accessToken,
        line.numberId,
      ).catch((error: any) => {
        console.warn('⚠️ [WebSocket] Erro ao validar credenciais (não bloqueia envio):', error.message);
        return true; // Continuar mesmo se falhar
      });

      // Enviar mensagem via WhatsApp Cloud API
      let apiResponse;

      if (data.messageType === 'image' && data.mediaUrl) {
        // Upload mídia primeiro, depois enviar
        try {
          // Obter caminho do arquivo
          let filePath: string;
          if (data.mediaUrl.startsWith('/media/')) {
            const filename = data.mediaUrl.replace('/media/', '');
            filePath = await this.mediaService.getFilePath(filename);
          } else if (data.mediaUrl.startsWith('http')) {
            const appUrl = process.env.APP_URL || 'https://api.newvend.taticamarketing.com.br';
            if (data.mediaUrl.startsWith(appUrl)) {
              const urlPath = new URL(data.mediaUrl).pathname;
              const filename = urlPath.replace('/media/', '');
              filePath = await this.mediaService.getFilePath(filename);
            } else {
              // Baixar arquivo externo temporariamente
              const response = await axios.get(data.mediaUrl, { responseType: 'arraybuffer' });
              filePath = path.join('./uploads', `temp-${Date.now()}-image.jpg`);
              await fs.mkdir('./uploads', { recursive: true });
              await fs.writeFile(filePath, response.data);
            }
          } else {
            filePath = path.join('./uploads', data.mediaUrl.replace(/^\/media\//, ''));
          }

          // Upload para Cloud API
          const uploadResult = await this.whatsappCloudService.uploadMedia({
            phoneNumberId: line.numberId,
            token: app.accessToken,
            mediaPath: filePath,
            mediaType: 'image',
          });

          // Enviar mídia usando mediaId
          apiResponse = await this.whatsappCloudService.sendMedia({
            phoneNumberId: line.numberId,
            token: app.accessToken,
            to: data.contactPhone,
            mediaType: 'image',
            mediaId: uploadResult.id,
            caption: data.message,
          });

          // Limpar arquivo temporário se necessário
          if (filePath.includes('temp-')) {
            await fs.unlink(filePath).catch(() => { });
          }
        } catch (error: any) {
          console.error('❌ [WebSocket] Erro ao enviar imagem:', error.message);
          throw error;
        }
      } else if ((data.messageType === 'document' || data.messageType === 'video' || data.messageType === 'audio') && data.mediaUrl) {
        // Upload mídia primeiro, depois enviar
        try {
          const fileName = data.fileName || data.mediaUrl.split('/').pop() || 'document.pdf';
          const cleanFileName = fileName.includes('-') && fileName.match(/^\d+-/)
            ? fileName.replace(/^\d+-/, '').replace(/-\d+\./, '.')
            : fileName;

          // Determinar tipo de mídia baseado na extensão
          const getMediaType = (filename: string): 'document' | 'video' | 'audio' => {
            const ext = filename.split('.').pop()?.toLowerCase();
            if (['mp4', 'mpeg', 'avi', 'mov'].includes(ext || '')) {
              return 'video';
            }
            if (['mp3', 'ogg', 'wav', 'm4a'].includes(ext || '')) {
              return 'audio';
            }
            return 'document';
          };

          const mediaType = getMediaType(cleanFileName);

          // Obter caminho do arquivo
          let filePath: string;
          if (data.mediaUrl.startsWith('/media/')) {
            const filename = data.mediaUrl.replace('/media/', '');
            filePath = await this.mediaService.getFilePath(filename);
          } else if (data.mediaUrl.startsWith('http')) {
            const appUrl = process.env.APP_URL || 'https://api.newvend.taticamarketing.com.br';
            if (data.mediaUrl.startsWith(appUrl)) {
              const urlPath = new URL(data.mediaUrl).pathname;
              const filename = urlPath.replace('/media/', '');
              filePath = await this.mediaService.getFilePath(filename);
            } else {
              // Baixar arquivo externo temporariamente
              const response = await axios.get(data.mediaUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
              });
              filePath = path.join('./uploads', `temp-${Date.now()}-${cleanFileName}`);
              await fs.mkdir('./uploads', { recursive: true });
              await fs.writeFile(filePath, response.data);
            }
          } else {
            filePath = path.join('./uploads', data.mediaUrl.replace(/^\/media\//, ''));
          }

          // Upload para Cloud API
          const uploadResult = await this.whatsappCloudService.uploadMedia({
            phoneNumberId: line.numberId,
            token: app.accessToken,
            mediaPath: filePath,
            mediaType,
          });

          // Enviar mídia usando mediaId
          apiResponse = await this.whatsappCloudService.sendMedia({
            phoneNumberId: line.numberId,
            token: app.accessToken,
            to: data.contactPhone,
            mediaType,
            mediaId: uploadResult.id,
            caption: data.message,
            filename: cleanFileName,
          });

          // Limpar arquivo temporário se necessário
          if (filePath.includes('temp-')) {
            await fs.unlink(filePath).catch(() => { });
          }
        } catch (error: any) {
          console.error('❌ [WebSocket] Erro ao enviar mídia:', error.message);
          throw error;
        }
      } else {
        // Enviar mensagem de texto
        apiResponse = await this.whatsappCloudService.sendTextMessage({
          phoneNumberId: line.numberId,
          token: app.accessToken,
          to: data.contactPhone,
          message: data.message,
        });
      }

      // Buscar contato
      const contact = await (this.prisma as any).contact.findFirst({
        where: { phone: data.contactPhone },
      });

      // Salvar conversa usando a linha ATUAL do operador
      // Isso garante que mesmo se a linha foi trocada, a mensagem vai pela linha atual
      const conversation = await this.conversationsService.create((user as any).tenantId || 'default-tenant', {
        contactName: contact?.name || 'Desconhecido',
        contactPhone: data.contactPhone,
        segment: user.segment,
        userName: user.name,
        userLine: currentLineId, // Sempre usar a linha atual
        userId: user.id, // Operador específico que está enviando
        message: data.message,
        sender: 'operator',
        messageType: data.messageType || 'text',
        mediaUrl: data.mediaUrl,
        messageId: apiResponse?.messages?.[0]?.id, // Salvar wamid para referência futura
      });

      // Log apenas para mensagens enviadas com sucesso (fluxo principal)
      console.log(`✅ Mensagem enviada: ${user.name} → ${data.contactPhone}`);

      // REMOVIDO: Não emitir 'message-sent' imediatamente. 
      // Aguardar confirmação do webhook (message-status) para evitar mensagens fantasmas em caso de erro (ex: 24h).
      // client.emit('message-sent', { message: conversation });

      // Se houver supervisores online do mesmo segmento, enviar para eles também
      this.emitToSupervisors(user.segment, 'new_message', { message: conversation });

      // Executar registros e validações em paralelo (não bloquear resposta)
      Promise.all([
        // Registrar mensagem do operador para controle de repescagem (assíncrono)
        this.controlPanelService.registerOperatorMessage(
          data.contactPhone,
          user.id,
          user.segment
        ).catch(err => console.warn('Erro ao registrar mensagem do operador:', err)),

        // Registrar evento de mensagem enviada (assíncrono)
        this.systemEventsService.logEvent(
          EventType.MESSAGE_SENT,
          EventModule.WEBSOCKET,
          {
            userId: user.id,
            userName: user.name,
            contactPhone: data.contactPhone,
            messageType: data.messageType || 'text',
            lineId: currentLineId,
            linePhone: line?.phone,
          },
          user.id,
          EventSeverity.INFO,
          user.tenantId,
        ).catch(err => console.warn('Erro ao registrar evento:', err)),

        // Health check: Validar credenciais Cloud API (assíncrono, não bloqueia envio)
        // Executar em paralelo para não atrasar o envio
        this.whatsappCloudService.validateCredentials(
          app.accessToken,
          line.numberId,
        ).catch((error: any) => {
          console.warn('⚠️ [WebSocket] Erro ao validar credenciais (não bloqueia envio):', error.message);
          return true; // Continuar mesmo se falhar
        }),
      ]).catch(() => {
        // Ignorar erros em operações assíncronas
      });

      return { success: true, conversation };
    } catch (error: any) {
      const errorResponse = error.getResponse ? error.getResponse() : error.response?.data || error;
      const errorCode = errorResponse?.error?.code || errorResponse?.code || error.code;

      console.error('❌ [WebSocket] Erro ao enviar mensagem:', {
        response: errorResponse,
        message: error.message,
        code: errorCode,
      });

      // Verificar erro de janela de 24h (131047)
      if (errorCode === 131047) {
        this.emitToUser(user.id, 'message-error', {
          type: '24h_window_expired',
          contactPhone: data.contactPhone,
          message: 'A janela de 24h para enviar mensagens livres expirou. Use um template para reativar a conversa.',
        });
        return { error: 'Janela de 24h expirada.' };
      }

      // Registrar evento de erro
      await this.systemEventsService.logEvent(
        error.code === 'ECONNABORTED' || error.message?.includes('timeout')
          ? EventType.TIMEOUT_ERROR
          : EventType.API_ERROR,
        EventModule.WEBSOCKET,
        {
          userId: user.id,
          userName: user.name,
          contactPhone: data.contactPhone,
          errorCode: errorCode,
          errorMessage: error.message,
          errorDetails: errorResponse,
        },
        user.id,
        EventSeverity.ERROR,
        user.tenantId,
      );

      // Falhou - notificar operador
      return { error: 'Não foi possível enviar a mensagem. Verifique a conexão das linhas do seu segmento.' };
    }
  }



  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { contactPhone: string; typing: boolean },
  ) {
    // Emitir evento de digitação para outros usuários
    client.broadcast.emit('user-typing', {
      contactPhone: data.contactPhone,
      typing: data.typing,
    });
  }





  // Método para emitir mensagens recebidas via webhook
  async emitNewMessage(conversation: any) {
    console.log(`📤 Emitindo new_message para contactPhone: ${conversation.contactPhone}`, {
      userId: conversation.userId,
      userLine: conversation.userLine,
    });

    // DEBUG: Listar todos os usuários conectados
    console.log(`  → Usuários conectados: [${Array.from(this.connectedUsers.keys()).join(', ')}]`);

    let messageSent = false;

    // 1. Primeiro, tentar enviar para o operador específico que está atendendo (userId)
    if (conversation.userId) {
      // Garantir que userId é um número (pode vir como string)
      const userIdNum = Number(conversation.userId);
      const socketId = this.connectedUsers.get(userIdNum);
      console.log(`  → Procurando userId ${userIdNum} (tipo: ${typeof userIdNum}) em connectedUsers: socketId=${socketId || 'NÃO ENCONTRADO'}`);

      // Se o usuário está em connectedUsers, ele está conectado via WebSocket
      // Não devemos bloquear o envio baseado no status do banco (que pode estar desatualizado aka 'Offline')
      if (socketId) {
        console.log(`  ✅ Enviando para ${userIdNum} (socket: ${socketId}) - operador específico (userId: ${conversation.userId})`);
        this.server.to(socketId).emit('new_message', { message: conversation });
        messageSent = true;
      } else {
        console.warn(`  ⚠️ Operador ${conversation.userId} não está conectado via WebSocket`);
      }
    }

    // 2. Se não enviou para operador específico, enviar para TODOS os operadores online do segmento (Pool)
    if (!messageSent && conversation.segment) {
      console.log(`  → Fallback: Enviando para todos os operadores online do segmento ${conversation.segment}`);
      const segmentOperators = await (this.prisma as any).user.findMany({
        where: {
          segment: conversation.segment,
          status: 'Online',
          role: 'operator',
        },
      });

      console.log(`  → Encontrados ${segmentOperators.length} operador(es) online no segmento ${conversation.segment}`);

      segmentOperators.forEach(op => {
        const socketId = this.connectedUsers.get(op.id);
        if (socketId) {
          console.log(`  ✅ Enviando para ${op.name} (${op.role}) - operador do segmento`);
          this.server.to(socketId).emit('new_message', { message: conversation });
          messageSent = true;
        }
      });
    }

    // 3. Se ainda não enviou e não tem userLine, tentar encontrar operador por conversas ativas do contato
    if (!messageSent && !conversation.userLine) {
      console.log(`  → Tentando encontrar operador por conversas ativas do contato ${conversation.contactPhone}`);
      const activeConversation = await (this.prisma as any).conversation.findFirst({
        where: {
          contactPhone: conversation.contactPhone,
          tabulation: null,
          userId: { not: null },
        },
        orderBy: {
          datetime: 'desc',
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

      if (activeConversation?.userId) {
        const socketId = this.connectedUsers.get(activeConversation.userId);
        if (socketId) {
          const user = await (this.prisma as any).user.findUnique({
            where: { id: activeConversation.userId },
          });
          if (user && user.status === 'Online') {
            console.log(`  ✅ Enviando para ${user.name} - encontrado por conversa ativa`);
            this.server.to(socketId).emit('new_message', { message: conversation });
            messageSent = true;
          }
        }
      }
    }

    if (!messageSent) {
      console.warn(`  ⚠️ Mensagem não pôde ser enviada em tempo real - será processada quando operador ficar online`);
    }

    // Emitir para supervisores do segmento
    if (conversation.segment) {
      this.emitToSupervisors(conversation.segment, 'new_message', { message: conversation });
    }

    return { success: true, conversation };
  }

  /**
   * Retorna o timestamp de conexão de um operador
   */
  getOperatorConnectionTime(userId: number): number | null {
    return this.operatorConnectionTime.get(userId) || null;
  }

  // Método público para enviar notificação para um usuário específico
  public emitToUser(userId: number, event: string, data: any) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  private async emitToSupervisors(segment: number, event: string, data: any) {
    const supervisors = await (this.prisma as any).user.findMany({
      where: {
        role: 'supervisor',
        segment,
      },
    });

    supervisors.forEach(supervisor => {
      const socketId = this.connectedUsers.get(supervisor.id);
      if (socketId) {
        this.server.to(socketId).emit(event, data);
      }
    });
  }

  // Emitir atualização de conversa tabulada
  async emitConversationTabulated(contactPhone: string, tabulationId: number) {
    this.server.emit('conversation-tabulated', { contactPhone, tabulationId });
  }

  /**
   * Método público para enviar mensagem via WhatsApp Cloud API
   * Usado por serviços externos (ex: AutoMessageService)
   */
  async sendMessageToCloudApi(
    phoneNumberId: string,
    token: string,
    contactPhone: string,
    message: string,
  ): Promise<void> {
    try {
      await this.whatsappCloudService.sendTextMessage({
        phoneNumberId,
        token,
        to: contactPhone,
        message,
      });
    } catch (error: any) {
      console.error(`❌ [WebSocket] Erro ao enviar mensagem via Cloud API:`, error.message);
      throw error;
    }
  }
}
