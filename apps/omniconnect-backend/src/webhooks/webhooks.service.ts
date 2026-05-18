import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { LinesService } from '../lines/lines.service';
import { MediaService } from '../media/media.service';
import { ControlPanelService } from '../control-panel/control-panel.service';
import { BlocklistService } from '../blocklist/blocklist.service';
import { SystemEventsService, EventType, EventModule, EventSeverity } from '../system-events/system-events.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class WebhooksService {
  private readonly uploadsDir = './uploads';

  constructor(
    private prisma: PrismaService,
    private conversationsService: ConversationsService,
    private websocketGateway: WebsocketGateway,
    private linesService: LinesService,
    private mediaService: MediaService,
    private controlPanelService: ControlPanelService,
    private blocklistService: BlocklistService,
    private systemEventsService: SystemEventsService,
  ) { }

  async handleEvolutionMessage(data: any) {
    try {
      console.log('📩 Webhook recebido:', JSON.stringify(data, null, 2));

      // Verificar se é uma mensagem recebida
      if (data.event === 'messages.upsert' || data.event === 'MESSAGES_UPSERT') {
        // Extrair o objeto completo da mensagem (com key, message, pushName, etc)
        const message = data.data || data.message;

        if (!message || !message.key) {
          return { status: 'ignored', reason: 'No message data or key' };
        }

        // Ignorar mensagens enviadas pelo próprio bot
        if (message.key.fromMe) {
          return { status: 'ignored', reason: 'Message from self' };
        }

        // Ignorar mensagens de grupos (remoteJid termina com @g.us)
        if (message.key.remoteJid?.includes('@g.us')) {
          console.log('🚫 Mensagem de grupo ignorada:', message.key.remoteJid);
          return { status: 'ignored', reason: 'Group message' };
        }

        // Extrair número do remetente (remoteJid quando fromMe=false é o remetente)
        const from = message.key.remoteJid
          ?.replace('@s.whatsapp.net', '')
          ?.replace('@lid', '');

        if (!from) {
          console.warn('⚠️ Webhook sem remoteJid; ignorando.', { key: message.key });
          return { status: 'ignored', reason: 'Missing remoteJid' };
        }

        console.log('📱 Mensagem de:', from, '| fromMe:', message.key.fromMe);

        // Extrair texto da mensagem
        const messageText = message.message?.conversation
          || message.message?.extendedTextMessage?.text
          || message.message?.imageMessage?.caption
          || message.message?.videoMessage?.caption
          || message.message?.documentMessage?.caption
          || (message.message?.imageMessage ? 'Imagem recebida' : undefined)
          || (message.message?.videoMessage ? 'Vídeo recebido' : undefined)
          || (message.message?.audioMessage ? 'Áudio recebido' : undefined)
          || (message.message?.documentMessage ? 'Documento recebido' : undefined)
          || 'Mensagem recebida';

        console.log('💬 Texto:', messageText);

        const messageType = this.getMessageType(message.message);
        let mediaUrl = this.getMediaUrl(message.message);

        // Buscar a linha que recebeu a mensagem
        const instanceName = data.instance || data.instanceName;
        const phoneNumber = instanceName?.replace('line_', '');

        const line = await this.prisma.linesStock.findFirst({
          where: {
            phone: {
              contains: phoneNumber,
            },
          },
          include: {
            operators: {
              include: {
                user: true,
              },
            },
          },
        });

        if (!line) {
          console.warn('⚠️ [Webhook] Linha não encontrada para o número:', phoneNumber);
          return { status: 'ignored', reason: 'Line not found' };
        }

        // Resolver tenantId via App vinculado à linha (trusted; não vem do payload).
        const lineApp = await this.prisma.app.findUnique({
          where: { id: line.appId },
          select: { tenantId: true },
        });
        const tenantId: string = lineApp?.tenantId || (line as any).tenantId || 'default-tenant';

        console.log(`🔍 [Webhook] Linha encontrada: ID ${line.id}, Phone: ${line.phone}`, {
          operadoresVinculados: line.operators.length,
          operadores: line.operators.map(lo => ({
            userId: lo.userId,
            userName: lo.user.name,
            status: lo.user.status,
            role: lo.user.role,
          })),
        });

        // Processar mídia base64 se a linha tiver receiveMedia ativado
        if (line.receiveMedia && messageType !== 'text') {
          console.log('🔍 [Webhook] Tentando extrair mídia Base64...');
          const base64Media = this.extractBase64Media(message.message);

          if (base64Media) {
            console.log('✅ [Webhook] Base64 encontrado, mimetype:', base64Media.mimetype);
            try {
              const fileName = `${Date.now()}-${from}-${messageType}.${this.getExtension(messageType, base64Media.mimetype)}`;
              const localFileName = await this.saveBase64Media(base64Media.data, fileName, base64Media.mimetype);

              if (localFileName) {
                mediaUrl = `/media/${localFileName}`;
                console.log('📥 Mídia Base64 salva localmente:', mediaUrl);
              }
            } catch (error) {
              console.error('❌ Erro ao salvar mídia Base64:', error.message);
            }
          } else {
            console.log('⚠️ [Webhook] Base64 não encontrado, tentando baixar da URL...');
            if (mediaUrl) {
              // Fallback: baixar da URL se não tiver base64
              try {
                const fileName = `${Date.now()}-${from}-${messageType}.${this.getExtension(messageType)}`;
                const localFileName = await this.mediaService.downloadMediaFromEvolution(mediaUrl, fileName);

                if (localFileName) {
                  mediaUrl = `/media/${localFileName}`;
                  console.log('📥 Mídia URL salva localmente:', mediaUrl);
                }
              } catch (error) {
                console.error('❌ Erro ao baixar mídia:', error.message);
              }
            } else {
              console.warn('⚠️ [Webhook] Nenhuma URL de mídia encontrada');
            }
          }
        } else if (mediaUrl && messageType !== 'text') {
          // Se não tem receiveMedia mas tem mídia por URL, tentar baixar
          console.log('📥 [Webhook] Baixando mídia da URL (receiveMedia desativado):', mediaUrl);
          try {
            const fileName = `${Date.now()}-${from}-${messageType}.${this.getExtension(messageType)}`;
            const localFileName = await this.mediaService.downloadMediaFromEvolution(mediaUrl, fileName);

            if (localFileName) {
              mediaUrl = `/media/${localFileName}`;
              console.log('📥 Mídia salva localmente:', mediaUrl);
            }
          } catch (error) {
            console.error('❌ Erro ao baixar mídia:', error.message);
          }
        }

        // Buscar contato
        let contact = await this.prisma.contact.findFirst({
          where: { phone: from },
        });

        if (!contact) {
          // Criar contato se não existir
          contact = await this.prisma.contact.create({
            data: {
              name: message.pushName || from,
              phone: from,
              segment: line.segment,
            },
          });
        }

        // Registrar resposta do cliente (reseta repescagem)
        await this.controlPanelService.registerClientResponse(from);

        // Verificar frases de bloqueio automático
        const isBlockPhrase = await this.controlPanelService.checkBlockPhrases(messageText, line.segment);

        let blockedByPhrase = false;
        if (isBlockPhrase) {
          console.log('🚫 Frase de bloqueio detectada:', messageText);
          blockedByPhrase = true;

          // Adicionar à blocklist
          await this.blocklistService.create(tenantId, {
            name: contact.name,
            phone: from,
            cpf: contact.cpf,
          });

          console.log('✅ Contato adicionado à blocklist:', from);
        }

        // Distribuir mensagem usando algoritmo inteligente
        const finalOperatorId = await this.linesService.distributeInboundMessage(line.id, from);
        console.log(`📋 [Webhook] Mensagem de ${from} atribuída ao operador ${finalOperatorId || 'nenhum (sem operadores online)'}`);

        // Se ainda não encontrou operador online, adicionar à fila de mensagens
        if (!finalOperatorId) {
          console.log(`📥 [Webhook] Nenhum operador online, adicionando mensagem à fila...`);

          // Adicionar à fila de mensagens
          await this.prisma.messageQueue.create({
            data: {
              tenantId,
              contactPhone: from,
              contactName: contact.name,
              message: messageText,
              messageType,
              mediaUrl,
              segment: line.segment || undefined,
              status: 'pending',
            },
          });

          // Registrar evento de mensagem na fila
          await this.systemEventsService.logEvent(
            EventType.MESSAGE_QUEUED,
            EventModule.WEBHOOKS,
            {
              contactPhone: from,
              contactName: contact.name,
              messageType,
              lineId: line.id,
              linePhone: line.phone,
            },
            null,
            EventSeverity.WARNING,
          );

          return { status: 'queued', message: 'Mensagem adicionada à fila (nenhum operador online)' };
        }

        // Buscar nome do operador se houver
        let operatorName: string | null = null;
        if (finalOperatorId) {
          const operator = await this.prisma.user.findFirst({
            where: { id: finalOperatorId },
          });
          operatorName = operator?.name || null;
        }

        // Criar conversa
        const conversation = await this.conversationsService.create(tenantId, {
          contactName: contact.name,
          contactPhone: from,
          segment: line.segment,
          userName: operatorName,
          userLine: line.id,
          userId: finalOperatorId, // Operador específico que vai atender (ou null se não houver)
          message: messageText,
          sender: 'contact',
          messageType,
          mediaUrl,
        });

        // Registrar evento de mensagem recebida
        await this.systemEventsService.logEvent(
          EventType.MESSAGE_RECEIVED,
          EventModule.WEBHOOKS,
          {
            contactPhone: from,
            contactName: contact.name,
            messageType,
            userId: finalOperatorId,
            lineId: line.id,
            linePhone: line.phone,
            blockedByPhrase,
          },
          finalOperatorId || undefined,
          blockedByPhrase ? EventSeverity.WARNING : EventSeverity.INFO,
        );

        // Emitir via WebSocket (incluir flag de bloqueio se aplicável)
        const messagePayload = {
          ...conversation,
          blockedByPhrase,
        };

        await this.websocketGateway.emitNewMessage(messagePayload);

        return { status: 'success', conversation, blockedByPhrase };
      }

      // Verificar status de conexão
      if (data.event === 'connection.update' || data.event === 'CONNECTION_UPDATE') {
        const state = data.data?.state || data.state;

        if (state === 'close' || state === 'DISCONNECTED') {
          // Linha foi desconectada/banida
          const instanceName = data.instance || data.instanceName;
          const phoneNumber = instanceName?.replace('line_', '');

          const line = await this.prisma.linesStock.findFirst({
            where: {
              phone: {
                contains: phoneNumber,
              },
            },
          });

          if (line) {
            // Marcar como banida e trocar automaticamente
            await this.linesService.handleBannedLine(line.id);
          }

          return { status: 'line_disconnected', lineId: line?.id };
        }

        // Linha conectada (QRCODE escaneado)
        if (state === 'open' || state === 'OPEN' || state === 'connected' || state === 'CONNECTED') {
          const instanceName = data.instance || data.instanceName;
          const phoneNumber = instanceName?.replace('line_', '');

          const line = await this.prisma.linesStock.findFirst({
            where: {
              phone: {
                contains: phoneNumber,
              },
            },
          });

          if (line) {
            // Verificar se a linha é padrão (segmento "Padrão") e precisa de um segmento
            const defaultSegment = await this.prisma.segment.findFirst({
              where: { name: 'Padrão' },
            });

            const isDefaultLine = defaultSegment && line.segment === defaultSegment.id;

            if (isDefaultLine) {
              // Linha padrão: buscar qualquer operador online para herdar o segmento
              const operatorWithSegment = await this.prisma.user.findFirst({
                where: {
                  role: 'operator',
                  status: 'Online',
                  segment: { not: null },
                },
              });

              // Se encontrou operador, atualizar segmento da linha para o do operador
              if (operatorWithSegment && operatorWithSegment.segment) {
                await this.prisma.linesStock.update({
                  where: { id: line.id },
                  data: { segment: operatorWithSegment.segment },
                });
                console.log(`🔄 [Webhook] Linha padrão ${line.phone} atualizada para o segmento ${operatorWithSegment.segment} do operador ${operatorWithSegment.name}`);
              }
            }

            console.log(`✅ [Webhook] Linha ${line.phone} conectada e pronta para uso no segmento ${line.segment || 'sem segmento'}`);
          }


          return { status: 'line_connected', lineId: line?.id };
        }
      }

      return { status: 'processed' };
    } catch (error) {
      console.error('Erro ao processar webhook:', error);
      return { status: 'error', error: error.message };
    }
  }

  private getMessageType(message: any): string {
    if (message?.imageMessage) return 'image';
    if (message?.videoMessage) return 'video';
    if (message?.audioMessage) return 'audio';
    if (message?.documentMessage) return 'document';
    return 'text';
  }

  private getMediaUrl(message: any): string | undefined {
    if (message?.imageMessage?.url) return message.imageMessage.url;
    if (message?.videoMessage?.url) return message.videoMessage.url;
    if (message?.audioMessage?.url) return message.audioMessage.url;
    if (message?.documentMessage?.url) return message.documentMessage.url;
    return undefined;
  }

  private getExtension(messageType: string, mimetype?: string): string {
    // Tentar extrair do mimetype primeiro
    if (mimetype) {
      const ext = mimetype.split('/')[1]?.split(';')[0];
      if (ext) {
        // Normalizar extensões comuns
        const normalizedExt = ext.replace('jpeg', 'jpg').replace('mpeg', 'mp3');
        return normalizedExt;
      }
    }

    const extensions = {
      image: 'jpg',
      video: 'mp4',
      audio: 'ogg',
      document: 'pdf',
    };
    return extensions[messageType] || 'bin';
  }

  // Extrair mídia em Base64 da mensagem (quando webhook_base64 = true)
  private extractBase64Media(message: any): { data: string; mimetype: string } | null {
    // Verificar cada tipo de mídia
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];

    for (const type of mediaTypes) {
      if (message?.[type]) {
        const mediaMsg = message[type];

        console.log(`🔍 [Webhook] Verificando ${type}:`, {
          hasBase64: !!mediaMsg.base64,
          hasMedia: !!mediaMsg.media,
          hasDirectBase64: typeof mediaMsg === 'string',
          mimetype: mediaMsg.mimetype,
          keys: Object.keys(mediaMsg),
        });

        // A Evolution API pode enviar base64 em diferentes formatos
        // Formato 1: { base64: "...", mimetype: "..." }
        if (mediaMsg.base64) {
          console.log(`✅ [Webhook] Base64 encontrado em ${type}.base64`);
          return {
            data: mediaMsg.base64,
            mimetype: mediaMsg.mimetype || this.getDefaultMimetype(type),
          };
        }

        // Formato 2: { mediaKey, ... } com base64 no campo data
        if (mediaMsg.media) {
          console.log(`✅ [Webhook] Base64 encontrado em ${type}.media`);
          return {
            data: mediaMsg.media,
            mimetype: mediaMsg.mimetype || this.getDefaultMimetype(type),
          };
        }

        // Formato 3: O próprio objeto pode ser base64 (string direta)
        if (typeof mediaMsg === 'string' && mediaMsg.length > 100) {
          console.log(`✅ [Webhook] Base64 encontrado como string direta em ${type}`);
          return {
            data: mediaMsg,
            mimetype: this.getDefaultMimetype(type),
          };
        }
      }
    }

    console.log('❌ [Webhook] Nenhum formato de base64 encontrado');
    return null;
  }

  private getDefaultMimetype(messageType: string): string {
    const mimetypes = {
      imageMessage: 'image/jpeg',
      videoMessage: 'video/mp4',
      audioMessage: 'audio/ogg',
      documentMessage: 'application/pdf',
    };
    return mimetypes[messageType] || 'application/octet-stream';
  }

  // Salvar mídia Base64 em arquivo
  private async saveBase64Media(base64Data: string, fileName: string, mimetype: string): Promise<string | null> {
    try {
      // Remover prefixo data:xxx;base64, se existir
      const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');

      const buffer = Buffer.from(base64Clean, 'base64');
      const filePath = path.join(this.uploadsDir, fileName);

      await fs.mkdir(this.uploadsDir, { recursive: true });
      await fs.writeFile(filePath, buffer);

      console.log(`📁 Arquivo Base64 salvo: ${fileName} (${buffer.length} bytes)`);
      return fileName;
    } catch (error) {
      console.error('❌ Erro ao salvar arquivo Base64:', error);
      return null;
    }
  }
}
