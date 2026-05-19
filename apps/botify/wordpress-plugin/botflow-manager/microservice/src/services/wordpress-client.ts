import axios, { AxiosInstance } from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import NodeCache from 'node-cache';

export class WordPressClient {
  private client: AxiosInstance;
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes (600 seconds)
    const normalizedBaseUrl = config.WORDPRESS_API_URL.replace(/\/wp-json\/?$/, '');

    this.client = axios.create({
      baseURL: normalizedBaseUrl,
      headers: {
        'X-API-Key': config.WORDPRESS_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        logger.error('WordPress API error:', error.response?.data || error.message);
        throw error;
      }
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/wp-json/botflow/v1/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async getMetaAppSecret(): Promise<string | null> {
    // The current WordPress plugin does not expose this endpoint.
    return null;
  }

  async validateEvolutionApiKey(instance: string, apiKey: string): Promise<boolean> {
    // This validation is currently handled by the WordPress webhook endpoint.
    // Keep this permissive to avoid blocking webhook ingestion in microservice.
    return Boolean(instance && apiKey);
  }

  async logMetaWebhook(data: {
    accountId: string;
    eventType: string;
    payload: any;
  }): Promise<void> {
    try {
      await this.client.post('/wp-json/botflow/v1/microservice/webhook', {
        event: 'meta_webhook_received',
        payload: data,
      });
    } catch (error) {
      logger.error('Failed to log Meta webhook:', error);
    }
  }

  async logEvolutionWebhook(data: {
    instanceName: string;
    eventType: string;
    payload: any;
  }): Promise<void> {
    try {
      await this.client.post('/wp-json/botflow/v1/microservice/webhook', {
        event: 'evolution_webhook_received',
        payload: data,
      });
    } catch (error) {
      logger.error('Failed to log Evolution webhook:', error);
    }
  }

  async logGenericWebhook(data: {
    source: string;
    payload: any;
  }): Promise<void> {
    try {
      await this.client.post('/wp-json/botflow/v1/microservice/webhook', {
        event: 'generic_webhook_received',
        payload: data,
      });
    } catch (error) {
      logger.error('Failed to log generic webhook:', error);
    }
  }

  async logAIProcessing(data: {
    flowId: string;
    nodeId: string;
    conversationId: string;
    userMessage: string;
    aiResponse: string;
    provider: string;
    model: string;
    tokensUsed: number;
  }): Promise<void> {
    try {
      await this.client.post('/wp-json/botflow/v1/microservice/webhook', {
        event: 'ai_complete',
        response: data.aiResponse,
        messageId: data.conversationId,
        metadata: {
          flowId: data.flowId,
          nodeId: data.nodeId,
          provider: data.provider,
          model: data.model,
          tokensUsed: data.tokensUsed,
          userMessage: data.userMessage,
        },
      });
    } catch (error) {
      logger.error('Failed to log AI processing:', error);
    }
  }

  async getBotByAccount(accountId: string): Promise<{ botId: string; flowId: string } | null> {
    logger.debug(`Bot lookup by account not available for accountId=${accountId}`);
    return null;
  }

  async getBotByEvolutionInstance(instance: string): Promise<{ botId: string; flowId: string } | null> {
    logger.debug(`Bot lookup by evolution instance not available for instance=${instance}`);
    return null;
  }

  async getFlowConfig(flowId: string): Promise<any> {
    const cacheKey = `flow_${flowId}`;
    const cachedFlow = this.cache.get(cacheKey);

    if (cachedFlow) {
      logger.debug(`Flow ${flowId} fetched from internal cache.`);
      return cachedFlow;
    }

    try {
      const response = await this.client.get(`/wp-json/botflow/v1/flows/${flowId}`);
      if (response.data && response.data.data) {
        this.cache.set(cacheKey, response.data.data);
        return response.data.data;
      }
      return null;
    } catch (e) {
      logger.error(`Failed to fetch flow ${flowId} from WP:`, e);
      return null;
    }
  }

  async getAINodeConfig(flowId: string, nodeId: string): Promise<any> {
    try {
      const response = await this.client.get(`/wp-json/botflow/v1/ai-config/${flowId}/${nodeId}`);
      return response.data.data;
    } catch {
      return null;
    }
  }

  async resolveConversation(botId: string, contactPhone: string, contactName?: string): Promise<string | null> {
    try {
      const response = await this.client.post('/wp-json/botflow/v1/microservice/conversation/resolve', {
        bot_id: botId,
        contact_phone: contactPhone,
        contact_name: contactName || contactPhone,
      });
      return response.data?.data?.id || null;
    } catch (error) {
      logger.error('Failed to resolve conversation:', error);
      return null;
    }
  }

  async saveMessage(data: {
    botId?: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: any;
  }): Promise<void> {
    try {
      if (!data.botId) {
        logger.debug('Skipping saveMessage because botId is missing');
        return;
      }

      const direction = data.role === 'assistant' ? 'outgoing' : 'incoming';

      await this.client.post('/wp-json/botflow/v1/microservice/messages', {
        bot_id: data.botId,
        conversation_id: data.conversationId,
        content: data.content,
        role: data.role,
        sender_name: data.role === 'assistant' ? 'Bot' : 'User',
        sender_phone: direction === 'incoming' ? (data.metadata?.from || '') : '',
      });
    } catch (error) {
      logger.error('Failed to save message:', error);
    }
  }

  /**
   * Recent messages for AI context (chronological). Uses microservice-auth route.
   */
  async listConversationMessages(
    conversationId: string,
    limit = 40,
  ): Promise<
    Array<{
      direction: string;
      content: string;
      mediaUrl?: string | null;
    }>
  > {
    const cid = String(conversationId).trim();
    if (!cid) {
      return [];
    }
    const lim = Math.min(80, Math.max(1, limit));
    try {
      const response = await this.client.get(
        `/wp-json/botflow/v1/microservice/conversation/${cid}/messages`,
        { params: { limit: lim } },
      );
      const data = response.data?.data;
      if (!Array.isArray(data)) {
        return [];
      }
      return data.map((m: Record<string, unknown>) => ({
        direction: typeof m.direction === 'string' ? m.direction : '',
        content: typeof m.content === 'string' ? m.content : '',
        mediaUrl: typeof m.mediaUrl === 'string' ? m.mediaUrl : null,
      }));
    } catch (e) {
      logger.error(`Failed to list messages for conversation ${cid}:`, e);
      return [];
    }
  }

  async sendWhatsAppMessage(data: {
    botId?: string;
    conversationId?: string;
    message: string;
  }): Promise<boolean> {
    try {
      if (!data.botId || !data.conversationId) {
        logger.debug('Skipping sendWhatsAppMessage because botId/conversationId is missing');
        return false;
      }

      const response = await this.client.post('/wp-json/botflow/v1/microservice/send', {
        bot_id: data.botId,
        conversation_id: data.conversationId,
        content: data.message,
      });
      return response.data.success === true;
    } catch (error) {
      logger.error('Failed to send WhatsApp message:', error);
      return false;
    }
  }
}
