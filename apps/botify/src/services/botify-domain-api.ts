import { wpApi } from './wordpress-api';
import { omniconnectBotifyApi } from './omniconnect-botify-api';
import type { Bot, Conversation, ConversationFlow, Message, WhatsAppConfig } from '@/types/bot';

export type BotifyViteDataSource = 'wordpress' | 'omniconnect' | 'dual';

function source(): BotifyViteDataSource {
  const v = (import.meta.env.VITE_BOTIFY_DATA_SOURCE || 'wordpress').toLowerCase();
  if (v === 'omniconnect' || v === 'dual' || v === 'wordpress') return v;
  return 'wordpress';
}

async function tryOmni<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * APIs de bots/fluxos: WordPress, Omni ou dual (Omni primeiro, fallback WP).
 * Conversas, Meta, webhooks etc. continuam em `wordpress-api.ts`.
 */
export const botifyDomainApi = {
  source,

  async getBots(): Promise<Bot[]> {
    const s = source();
    if (s === 'wordpress') return wpApi.getBots();
    if (s === 'omniconnect') return omniconnectBotifyApi.getBots();
    const o = await tryOmni(() => omniconnectBotifyApi.getBots());
    return o ?? wpApi.getBots();
  },

  async getBot(id: string): Promise<Bot> {
    const s = source();
    if (s === 'wordpress') return wpApi.getBot(id);
    if (s === 'omniconnect') return omniconnectBotifyApi.getBot(id);
    const o = await tryOmni(() => omniconnectBotifyApi.getBot(id));
    if (o) return o;
    return wpApi.getBot(id);
  },

  async createBot(bot: Omit<Bot, 'id' | 'createdAt'>): Promise<Bot> {
    const s = source();
    if (s === 'wordpress') return wpApi.createBot(bot);
    if (s === 'omniconnect') return omniconnectBotifyApi.createBot(bot);
    const o = await tryOmni(() => omniconnectBotifyApi.createBot(bot));
    if (o) return o;
    return wpApi.createBot(bot);
  },

  async updateBot(id: string, updates: Partial<Bot>): Promise<Bot> {
    const s = source();
    if (s === 'wordpress') return wpApi.updateBot(id, updates);
    if (s === 'omniconnect') return omniconnectBotifyApi.updateBot(id, updates);
    const o = await tryOmni(() => omniconnectBotifyApi.updateBot(id, updates));
    if (o) return o;
    return wpApi.updateBot(id, updates);
  },

  async deleteBot(id: string): Promise<void> {
    const s = source();
    if (s === 'wordpress') return wpApi.deleteBot(id);
    if (s === 'omniconnect') return omniconnectBotifyApi.deleteBot(id);
    const done = await tryOmni(() => omniconnectBotifyApi.deleteBot(id).then(() => true));
    if (done) return;
    return wpApi.deleteBot(id);
  },

  async getFlows(botId?: string): Promise<ConversationFlow[]> {
    const s = source();
    if (s === 'wordpress') return wpApi.getFlows(botId);
    if (s === 'omniconnect') return omniconnectBotifyApi.getFlows(botId);
    const o = await tryOmni(() => omniconnectBotifyApi.getFlows(botId));
    return o ?? wpApi.getFlows(botId);
  },

  async getFlow(id: string): Promise<ConversationFlow> {
    const s = source();
    if (s === 'wordpress') return wpApi.getFlow(id);
    if (s === 'omniconnect') return omniconnectBotifyApi.getFlow(id);
    const o = await tryOmni(() => omniconnectBotifyApi.getFlow(id));
    if (o) return o;
    return wpApi.getFlow(id);
  },

  async createFlow(
    flow: Omit<ConversationFlow, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConversationFlow> {
    const s = source();
    if (s === 'wordpress') return wpApi.createFlow(flow);
    if (s === 'omniconnect') return omniconnectBotifyApi.createFlow(flow);
    const o = await tryOmni(() => omniconnectBotifyApi.createFlow(flow));
    if (o) return o;
    return wpApi.createFlow(flow);
  },

  async updateFlow(
    id: string,
    updates: Partial<ConversationFlow>,
  ): Promise<ConversationFlow> {
    const s = source();
    if (s === 'wordpress') return wpApi.updateFlow(id, updates);
    if (s === 'omniconnect') return omniconnectBotifyApi.updateFlow(id, updates);
    const o = await tryOmni(() => omniconnectBotifyApi.updateFlow(id, updates));
    if (o) return o;
    return wpApi.updateFlow(id, updates);
  },

  async deleteFlow(id: string): Promise<void> {
    const s = source();
    if (s === 'wordpress') return wpApi.deleteFlow(id);
    if (s === 'omniconnect') return omniconnectBotifyApi.deleteFlow(id);
    const done = await tryOmni(() => omniconnectBotifyApi.deleteFlow(id).then(() => true));
    if (done) return;
    return wpApi.deleteFlow(id);
  },

  /** Ativar/desativar fluxo: WP usa `isActive`; Omni usa publish/unpublish. */
  async setFlowActive(id: string, active: boolean): Promise<ConversationFlow> {
    const s = source();
    if (s === 'wordpress') {
      return wpApi.updateFlow(id, { isActive: active });
    }
    if (s === 'omniconnect') {
      return active
        ? omniconnectBotifyApi.publishFlow(id)
        : omniconnectBotifyApi.unpublishFlow(id);
    }
    const o = await tryOmni(() =>
      active
        ? omniconnectBotifyApi.publishFlow(id)
        : omniconnectBotifyApi.unpublishFlow(id),
    );
    if (o) return o;
    return wpApi.updateFlow(id, { isActive: active });
  },

  async getConversations(botId?: string): Promise<Conversation[]> {
    const s = source();
    if (s === 'wordpress') return wpApi.getConversations(botId).then((r) => r.data ?? []);
    if (s === 'omniconnect') return omniconnectBotifyApi.getConversations(botId);
    const o = await tryOmni(() => omniconnectBotifyApi.getConversations(botId));
    return o ?? (await wpApi.getConversations(botId)).data ?? [];
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    const s = source();
    if (s === 'wordpress') {
      return wpApi.getMessages(conversationId).then((r) => r.data ?? []);
    }
    if (s === 'omniconnect') return omniconnectBotifyApi.getMessages(conversationId);
    const o = await tryOmni(() => omniconnectBotifyApi.getMessages(conversationId));
    return o ?? (await wpApi.getMessages(conversationId)).data ?? [];
  },

  async sendMessage(conversationId: string, content: string): Promise<void> {
    const s = source();
    if (s === 'wordpress') {
      await wpApi.sendMessage(conversationId, content);
      return;
    }
    if (s === 'omniconnect') {
      await omniconnectBotifyApi.sendMessage(conversationId, content);
      return;
    }
    try {
      await omniconnectBotifyApi.sendMessage(conversationId, content);
    } catch {
      await wpApi.sendMessage(conversationId, content);
    }
  },

  async getWhatsAppConfig(botId: string): Promise<WhatsAppConfig | null> {
    const s = source();
    if (s === 'wordpress') return wpApi.getWhatsAppConfig(botId);
    if (s === 'omniconnect') return omniconnectBotifyApi.getWhatsAppConfig(botId);
    const o = await tryOmni(() => omniconnectBotifyApi.getWhatsAppConfig(botId));
    return o ?? wpApi.getWhatsAppConfig(botId);
  },

  async updateWhatsAppConfig(
    botId: string,
    patch: Partial<WhatsAppConfig>,
  ): Promise<WhatsAppConfig> {
    const s = source();
    if (s === 'wordpress') return wpApi.updateWhatsAppConfig(botId, patch);
    if (s === 'omniconnect') return omniconnectBotifyApi.updateWhatsAppConfig(botId, patch);
    const o = await tryOmni(() => omniconnectBotifyApi.updateWhatsAppConfig(botId, patch));
    if (o) return o;
    return wpApi.updateWhatsAppConfig(botId, patch);
  },
};
