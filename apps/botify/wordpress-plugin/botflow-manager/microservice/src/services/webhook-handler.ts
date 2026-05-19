import crypto from 'crypto';
import { WordPressClient } from './wordpress-client.js';
import { MessageQueue } from '../queue/message-queue.js';
import { SSEManager } from '../realtime/sse-manager.js';
import { logger } from '../utils/logger.js';

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: any;
      field: string;
    }>;
  }>;
}

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: any;
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
}

export class WebhookHandler {
  private wpClient: WordPressClient;
  private messageQueue: MessageQueue;
  private sseManager: SSEManager;

  constructor() {
    this.wpClient = new WordPressClient();
    this.messageQueue = MessageQueue.getInstance();
    this.sseManager = SSEManager.getInstance();
  }

  async handleMeta(payload: MetaWebhookPayload, signature: string, rawBody: string): Promise<void> {
    logger.info('Processing Meta webhook');

    // Get app secret from WordPress for signature verification
    const appSecret = await this.wpClient.getMetaAppSecret();

    if (appSecret) {
      const isValid = this.verifyMetaSignature(rawBody, signature, appSecret);
      if (!isValid) {
        logger.warn('Invalid Meta webhook signature');
        throw new Error('Invalid signature');
      }
    }

    // Process each entry
    for (const entry of payload.entry) {
      const accountId = entry.id;

      for (const change of entry.changes) {
        // Log webhook to WordPress
        await this.wpClient.logMetaWebhook({
          accountId,
          eventType: change.field,
          payload: change.value,
        });

        // Emit real-time event
        this.sseManager.broadcast('meta:webhook', {
          accountId,
          field: change.field,
          data: change.value,
        });

        // Process based on field type
        switch (change.field) {
          case 'messages':
            await this.processMetaMessages(accountId, change.value);
            break;
          case 'message_template_status_update':
            await this.processTemplateUpdate(accountId, change.value);
            break;
          default:
            logger.debug(`Unhandled Meta field: ${change.field}`);
        }
      }
    }
  }

  async handleEvolution(payload: EvolutionWebhookPayload, apiKey: string): Promise<void> {
    logger.info(`Processing Evolution webhook: ${payload.event}`);

    // Validate API key with WordPress
    const isValid = await this.wpClient.validateEvolutionApiKey(payload.instance, apiKey);
    if (!isValid) {
      logger.warn('Invalid Evolution API key');
      throw new Error('Invalid API key');
    }

    // Log webhook to WordPress
    await this.wpClient.logEvolutionWebhook({
      instanceName: payload.instance,
      eventType: payload.event,
      payload: payload.data,
    });

    // Emit real-time event
    this.sseManager.broadcast('evolution:webhook', {
      instance: payload.instance,
      event: payload.event,
      data: payload.data,
    });

    // Process based on event type
    switch (payload.event) {
      case 'MESSAGES_UPSERT':
        await this.processEvolutionMessage(payload.instance, payload.data);
        break;
      case 'MESSAGES_UPDATE':
        await this.processMessageUpdate(payload.instance, payload.data);
        break;
      case 'CONNECTION_UPDATE':
        await this.processConnectionUpdate(payload.instance, payload.data);
        break;
      case 'QRCODE_UPDATED':
        await this.processQRCodeUpdate(payload.instance, payload.data);
        break;
      default:
        logger.debug(`Unhandled Evolution event: ${payload.event}`);
    }
  }

  async logGenericWebhook(source: string, payload: any): Promise<void> {
    await this.wpClient.logGenericWebhook({
      source,
      payload,
    });
  }

  private verifyMetaSignature(rawBody: string, signature: string, appSecret: string): boolean {
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private async processMetaMessages(accountId: string, value: any): Promise<void> {
    const messages = value.messages || [];

    for (const message of messages) {
      // Check if this is an incoming message
      if (message.type === 'text' || message.type === 'interactive') {
        const messageText = message.text?.body ||
          message.interactive?.button_reply?.title ||
          message.interactive?.list_reply?.title;

        if (messageText) {
          // Find bot/flow for this account
          const botConfig = await this.wpClient.getBotByAccount(accountId);

          if (botConfig && botConfig.flowId) {
            // Queue for AI processing
            await this.messageQueue.addJob('process_message', {
              provider: 'meta',
              accountId,
              messageId: message.id,
              from: message.from,
              text: messageText,
              timestamp: message.timestamp,
              flowId: botConfig.flowId,
              botId: botConfig.botId,
            });
          }
        }
      }
    }
  }

  private async processEvolutionMessage(instance: string, data: any): Promise<void> {
    const message = data.message || data;

    // Check if this is an incoming message (not from me)
    if (message.key?.fromMe) return;

    const messageText = message.message?.conversation ||
      message.message?.extendedTextMessage?.text;

    if (messageText) {
      // Find bot/flow for this instance
      const botConfig = await this.wpClient.getBotByEvolutionInstance(instance);

      if (botConfig && botConfig.flowId) {
        // Queue for AI processing
        await this.messageQueue.addJob('process_message', {
          provider: 'evolution',
          instance,
          messageId: message.key?.id,
          from: message.key?.remoteJid,
          text: messageText,
          timestamp: message.messageTimestamp,
          flowId: botConfig.flowId,
          botId: botConfig.botId,
        });
      }
    }
  }

  private async processTemplateUpdate(accountId: string, value: any): Promise<void> {
    logger.info(`Template status update for account ${accountId}:`, value);

    // Notify frontend
    this.sseManager.broadcast('meta:template_update', {
      accountId,
      templateName: value.message_template_name,
      status: value.event,
    });
  }

  private async processMessageUpdate(instance: string, data: any): Promise<void> {
    logger.info(`Message update for instance ${instance}:`, data);

    // Notify frontend
    this.sseManager.broadcast('evolution:message_update', {
      instance,
      data,
    });
  }

  private async processConnectionUpdate(instance: string, data: any): Promise<void> {
    logger.info(`Connection update for instance ${instance}:`, data);

    // Notify frontend
    this.sseManager.broadcast('evolution:connection_update', {
      instance,
      state: data.state,
    });
  }

  private async processQRCodeUpdate(instance: string, data: any): Promise<void> {
    logger.info(`QR code update for instance ${instance}`);

    // Notify frontend
    this.sseManager.broadcast('evolution:qrcode', {
      instance,
      qrcode: data.qrcode,
    });
  }
}
