/**
 * Cliente para API Nest `botify` no omniconnect-backend (JWT Bearer).
 * Auth: VITE_OMNICONNECT_API_TOKEN ou localStorage omniconnect_access_token.
 */
import type { Bot, Conversation, ConversationFlow, Message, WhatsAppConfig } from '@/types/bot';
import { APIError } from './wordpress-api';
import { getAccessToken } from '@/lib/omniconnectClient';

const base = (): string => {
  const u = import.meta.env.VITE_OMNICONNECT_API_URL || '/api';
  return u.replace(/\/$/, '');
};

function getBearerToken(): string | null {
  const fromEnv = import.meta.env.VITE_OMNICONNECT_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return getAccessToken();
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${base()}${path}`;
  const token = getBearerToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, credentials: 'include' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network request failed';
    throw new APIError(0, `Network error: ${message}`);
  }

  if (!response.ok) {
    const t = await response.text();
    throw new APIError(response.status, t || response.statusText);
  }

  return response.json() as Promise<T>;
}

type Paginated<T> = { data: T[]; meta: { page: number; limit: number; total: number } };

export const omniconnectBotifyApi = {
  async getBots(): Promise<Bot[]> {
    const json = await requestJson<Paginated<Bot>>('/botify/bots');
    return json.data ?? [];
  },

  async getBot(id: string): Promise<Bot> {
    return requestJson<Bot>(`/botify/bots/${encodeURIComponent(id)}`);
  },

  async createBot(
    bot: Omit<Bot, 'id' | 'createdAt'>,
  ): Promise<Bot> {
    return requestJson<Bot>('/botify/bots', {
      method: 'POST',
      body: JSON.stringify({
        name: bot.name,
        description: bot.description,
        isActive: bot.status !== 'offline',
      }),
    });
  },

  async updateBot(id: string, updates: Partial<Bot>): Promise<Bot> {
    return requestJson<Bot>(`/botify/bots/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.status !== undefined
          ? { isActive: updates.status !== 'offline' }
          : {}),
      }),
    });
  },

  async deleteBot(id: string): Promise<void> {
    await requestJson<unknown>(`/botify/bots/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getFlows(botId?: string): Promise<ConversationFlow[]> {
    const q = new URLSearchParams();
    if (botId) q.set('botId', botId);
    const qs = q.toString();
    const json = await requestJson<Paginated<ConversationFlow>>(
      `/botify/flows${qs ? `?${qs}` : ''}`,
    );
    return json.data ?? [];
  },

  async getFlow(id: string): Promise<ConversationFlow> {
    return requestJson<ConversationFlow>(`/botify/flows/${encodeURIComponent(id)}`);
  },

  async createFlow(
    flow: Omit<ConversationFlow, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConversationFlow> {
    return requestJson<ConversationFlow>('/botify/flows', {
      method: 'POST',
      body: JSON.stringify({
        botId: flow.botId,
        name: flow.name,
        triggerKeyword: flow.triggerKeyword,
        nodes: flow.nodes,
      }),
    });
  },

  async updateFlow(
    id: string,
    updates: Partial<ConversationFlow>,
  ): Promise<ConversationFlow> {
    return requestJson<ConversationFlow>(`/botify/flows/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(updates.botId !== undefined ? { botId: updates.botId } : {}),
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.triggerKeyword !== undefined
          ? { triggerKeyword: updates.triggerKeyword }
          : {}),
        ...(updates.nodes !== undefined ? { nodes: updates.nodes } : {}),
      }),
    });
  },

  async deleteFlow(id: string): Promise<void> {
    await requestJson<unknown>(`/botify/flows/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async publishFlow(id: string): Promise<ConversationFlow> {
    return requestJson<ConversationFlow>(
      `/botify/flows/${encodeURIComponent(id)}/publish`,
      { method: 'POST' },
    );
  },

  async unpublishFlow(id: string): Promise<ConversationFlow> {
    return requestJson<ConversationFlow>(
      `/botify/flows/${encodeURIComponent(id)}/unpublish`,
      { method: 'POST' },
    );
  },

  async getConversations(botId?: string): Promise<Conversation[]> {
    const q = new URLSearchParams();
    if (botId) q.set('botId', botId);
    const qs = q.toString();
    const json = await requestJson<Paginated<Record<string, unknown>>>(
      `/botify/conversations${qs ? `?${qs}` : ''}`,
    );
    return (json.data ?? []).map(mapOmniConversation);
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    const json = await requestJson<Paginated<Record<string, unknown>>>(
      `/botify/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
    );
    return (json.data ?? []).map((m, i) => mapOmniMessage(m, conversationId, i));
  },

  async sendMessage(conversationId: string, content: string): Promise<void> {
    const res = await requestJson<{ success?: boolean; message?: string }>(
      `/botify/conversations/${encodeURIComponent(conversationId)}/send`,
      { method: 'POST', body: JSON.stringify({ content }) },
    );
    if (!res.success) {
      throw new APIError(400, res.message ?? 'Send failed');
    }
  },

  async getWhatsAppConfig(botId: string): Promise<WhatsAppConfig | null> {
    const row = await requestJson<Record<string, unknown>>(
      `/botify/bots/${encodeURIComponent(botId)}/channel`,
    );
    return mapOmniChannel(botId, row);
  },

  async updateWhatsAppConfig(
    botId: string,
    patch: Partial<WhatsAppConfig>,
  ): Promise<WhatsAppConfig> {
    const row = await requestJson<Record<string, unknown>>(
      `/botify/bots/${encodeURIComponent(botId)}/channel`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          metaAccountId: patch.metaAccountId,
          businessAccountId: patch.businessAccountId,
          phoneNumberId: patch.phoneNumberId,
          accessToken: patch.accessToken,
          webhookSecret: patch.webhookSecret,
          metaWabaAccountId: patch.metaWabaAccountId,
          evolutionInstance: patch.evolutionInstance,
          evolutionApiKey: patch.evolutionApiKey,
          defaultFlowId: patch.defaultFlowId,
        }),
      },
    );
    return mapOmniChannel(botId, row)!;
  },

  async listMetaAccounts(): Promise<Record<string, unknown>[]> {
    return requestJson<Record<string, unknown>[]>('/botify/meta-accounts');
  },

  async getMetaAccountCredentials(
    id: string,
  ): Promise<{ accessToken: string; businessManagerId: string; metaWabaAccountId: string }> {
    return requestJson(`/botify/meta-accounts/${encodeURIComponent(id)}/credentials`);
  },

  async createMetaAccount(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return requestJson('/botify/meta-accounts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateMetaAccount(
    id: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return requestJson(`/botify/meta-accounts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async activateMetaAccount(id: string): Promise<Record<string, unknown>> {
    return requestJson(`/botify/meta-accounts/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
    });
  },

  async deleteMetaAccount(id: string): Promise<void> {
    await requestJson(`/botify/meta-accounts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};

function mapOmniConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id ?? ''),
    botId: String(row.botId ?? ''),
    contactName: String(row.contactName ?? ''),
    contactPhone: String(row.contactPhone ?? ''),
    lastMessage: String(row.lastMessage ?? ''),
    lastMessageTime: new Date(String(row.lastMessageTime ?? row.updatedAt ?? Date.now())),
    unreadCount: Number(row.unreadCount ?? 0),
    messages: [],
  };
}

function mapOmniMessage(
  row: Record<string, unknown>,
  conversationId: string,
  index: number,
): Message {
  const direction =
    row.direction === 'incoming' || row.role === 'user' ? 'incoming' : 'outgoing';
  return {
    id: String(row.id ?? `msg-${index}`),
    botId: '',
    conversationId,
    direction,
    content: String(row.content ?? ''),
    senderName: direction === 'incoming' ? 'Contact' : 'Bot',
    senderPhone: '',
    timestamp: new Date(String(row.createdAt ?? Date.now())),
    status: 'sent',
  };
}

function mapOmniChannel(botId: string, row: Record<string, unknown>): WhatsAppConfig | null {
  if (!row) return null;
  const lineHealth = row.lineHealth;
  return {
    botId,
    metaAccountId: String(row.metaAccountId ?? ''),
    businessAccountId: String(row.businessAccountId ?? ''),
    phoneNumberId: String(row.phoneNumberId ?? ''),
    accessToken: String(row.accessToken ?? ''),
    webhookUrl: String(row.webhookUrl ?? ''),
    webhookSecret: String(row.webhookSecret ?? ''),
    isConnected: Boolean(row.isConnected),
    metaWabaAccountId: String(row.metaWabaAccountId ?? ''),
    evolutionInstance: String(row.evolutionInstance ?? ''),
    evolutionApiKey: String(row.evolutionApiKey ?? ''),
    defaultFlowId: String(row.defaultFlowId ?? ''),
    lineHealth:
      lineHealth === 'healthy' || lineHealth === 'degraded' || lineHealth === 'disconnected'
        ? lineHealth
        : undefined,
  };
}
