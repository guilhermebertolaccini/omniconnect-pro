import crypto from 'crypto';
import { config } from '../config.js';
import { WordPressClient } from './wordpress-client.js';
import { MessageQueue } from '../queue/message-queue.js';
import { SSEManager } from '../realtime/sse-manager.js';
import { logger } from '../utils/logger.js';
import {
  omniResolveEvolutionInstance,
  omniResolveMetaAccount,
  type WebhookBotRouting,
} from './omniconnect-routing.js';

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: unknown;
      field: string;
    }>;
  }>;
}

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: unknown;
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
}

export class WebhookHandler {
  private wpClient: WordPressClient | null = null;
  private messageQueue: MessageQueue;
  private sseManager: SSEManager;

  constructor() {
    if (this.useWordpress()) {
      this.wpClient = new WordPressClient();
    }
    this.messageQueue = MessageQueue.getInstance();
    this.sseManager = SSEManager.getInstance();
  }

  private useWordpress(): boolean {
    return (
      config.BOTIFY_FLOW_SOURCE === 'wordpress' || config.BOTIFY_FLOW_SOURCE === 'dual'
    );
  }

  private useOmniconnect(): boolean {
    return (
      config.BOTIFY_FLOW_SOURCE === 'omniconnect' || config.BOTIFY_FLOW_SOURCE === 'dual'
    );
  }

  async handleMeta(payload: MetaWebhookPayload, signature: string, rawBody: string): Promise<void> {
    logger.info('Processing Meta webhook');

    const appSecret = await this.getMetaAppSecret();
    if (appSecret) {
      const isValid = this.verifyMetaSignature(rawBody, signature, appSecret);
      if (!isValid) {
        logger.warn('Invalid Meta webhook signature');
        throw new Error('Invalid signature');
      }
    } else {
      logger.warn('Meta webhook: no app secret configured — skipping signature verification');
    }

    for (const entry of payload.entry) {
      const accountId = entry.id;

      for (const change of entry.changes) {
        this.logMetaWebhook(accountId, change.field, change.value);

        this.sseManager.broadcast('meta:webhook', {
          accountId,
          field: change.field,
          data: change.value,
        });

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

    const isValid = await this.validateEvolutionApiKey(payload.instance, apiKey);
    if (!isValid) {
      logger.warn('Invalid Evolution API key');
      throw new Error('Invalid API key');
    }

    this.logEvolutionWebhook(payload.instance, payload.event, payload.data);

    this.sseManager.broadcast('evolution:webhook', {
      instance: payload.instance,
      event: payload.event,
      data: payload.data,
    });

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

  async logGenericWebhook(source: string, payload: unknown): Promise<void> {
    logger.info('Generic webhook received', { source, payloadType: typeof payload });
    if (this.useWordpress() && this.wpClient) {
      await this.wpClient.logGenericWebhook({ source, payload });
    }
  }

  private async getMetaAppSecret(): Promise<string | null> {
    const fromEnv = config.META_APP_SECRET?.trim();
    if (fromEnv) return fromEnv;
    if (this.useWordpress() && this.wpClient) {
      return this.wpClient.getMetaAppSecret();
    }
    return null;
  }

  private async validateEvolutionApiKey(instance: string, apiKey: string): Promise<boolean> {
    if (this.useOmniconnect()) {
      const routed = await omniResolveEvolutionInstance(instance, apiKey);
      if (routed) return true;
      if (config.OMNICONNECT_BACKEND_URL?.trim()) {
        return false;
      }
    }
    if (this.useWordpress() && this.wpClient) {
      return this.wpClient.validateEvolutionApiKey(instance, apiKey);
    }
    return Boolean(instance && apiKey);
  }

  private async resolveMetaRouting(accountId: string): Promise<WebhookBotRouting | null> {
    if (this.useOmniconnect()) {
      const omni = await omniResolveMetaAccount(accountId);
      if (omni) return omni;
    }
    if (this.useWordpress() && this.wpClient) {
      const wp = await this.wpClient.getBotByAccount(accountId);
      if (wp) return { botId: wp.botId, flowId: wp.flowId };
    }
    return null;
  }

  private async resolveEvolutionRouting(instance: string): Promise<WebhookBotRouting | null> {
    if (this.useOmniconnect()) {
      const omni = await omniResolveEvolutionInstance(instance);
      if (omni) return omni;
    }
    if (this.useWordpress() && this.wpClient) {
      const wp = await this.wpClient.getBotByEvolutionInstance(instance);
      if (wp) return { botId: wp.botId, flowId: wp.flowId };
    }
    return null;
  }

  private logMetaWebhook(accountId: string, eventType: string, payload: unknown): void {
    logger.info('Meta webhook event', { accountId, eventType });
    if (this.useWordpress() && this.wpClient) {
      void this.wpClient.logMetaWebhook({ accountId, eventType, payload });
    }
  }

  private logEvolutionWebhook(
    instanceName: string,
    eventType: string,
    payload: unknown,
  ): void {
    logger.info('Evolution webhook event', { instanceName, eventType });
    if (this.useWordpress() && this.wpClient) {
      void this.wpClient.logEvolutionWebhook({ instanceName, eventType, payload });
    }
  }

  private verifyMetaSignature(rawBody: string, signature: string, appSecret: string): boolean {
    const expectedSignature =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch {
      return false;
    }
  }

  private async processMetaMessages(accountId: string, value: unknown): Promise<void> {
    const v = value as { messages?: Array<Record<string, unknown>> };
    const messages = v.messages || [];

    for (const message of messages) {
      if (message.type === 'text' || message.type === 'interactive') {
        const interactive = message.interactive as
          | { button_reply?: { title?: string }; list_reply?: { title?: string } }
          | undefined;
        const text = message.text as { body?: string } | undefined;
        const messageText =
          text?.body ||
          interactive?.button_reply?.title ||
          interactive?.list_reply?.title;

        if (messageText && typeof messageText === 'string') {
          const botConfig = await this.resolveMetaRouting(accountId);

          if (botConfig?.flowId) {
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

  private async processEvolutionMessage(instance: string, data: unknown): Promise<void> {
    const d = data as {
      message?: {
        key?: { fromMe?: boolean; id?: string; remoteJid?: string };
        message?: {
          conversation?: string;
          extendedTextMessage?: { text?: string };
        };
        messageTimestamp?: number;
      };
      key?: { fromMe?: boolean; id?: string; remoteJid?: string };
    };
    const message = d.message || d;

    if (message.key?.fromMe) return;

    const inner = message.message;
    const messageText =
      inner?.conversation || inner?.extendedTextMessage?.text;

    if (messageText) {
      const botConfig = await this.resolveEvolutionRouting(instance);

      if (botConfig?.flowId) {
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

  private async processTemplateUpdate(accountId: string, value: unknown): Promise<void> {
    logger.info(`Template status update for account ${accountId}:`, value);
    const v = value as { message_template_name?: string; event?: string };
    this.sseManager.broadcast('meta:template_update', {
      accountId,
      templateName: v.message_template_name,
      status: v.event,
    });
  }

  private async processMessageUpdate(instance: string, data: unknown): Promise<void> {
    logger.info(`Message update for instance ${instance}:`, data);
    this.sseManager.broadcast('evolution:message_update', { instance, data });
  }

  private async processConnectionUpdate(instance: string, data: unknown): Promise<void> {
    const d = data as { state?: string };
    logger.info(`Connection update for instance ${instance}:`, data);
    this.sseManager.broadcast('evolution:connection_update', {
      instance,
      state: d.state,
    });
  }

  private async processQRCodeUpdate(instance: string, data: unknown): Promise<void> {
    logger.info(`QR code update for instance ${instance}`);
    const d = data as { qrcode?: string };
    this.sseManager.broadcast('evolution:qrcode', { instance, qrcode: d.qrcode });
  }
}
