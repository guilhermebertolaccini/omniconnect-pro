/**
 * Abstração resolve/save/list/send — WordPress vs Omni (G7-C8).
 */
import { config } from '../config.js';
import { WordPressClient } from './wordpress-client.js';
import {
  omniListConversationMessages,
  omniResolveConversation,
  omniSaveMessage,
  omniSendWhatsAppMessage,
} from './omniconnect-conversations.js';

let wpClient: WordPressClient | null = null;
function wp(): WordPressClient {
  if (!wpClient) wpClient = new WordPressClient();
  return wpClient;
}

function useOmniFirst(): boolean {
  return config.BOTIFY_FLOW_SOURCE === 'omniconnect' || config.BOTIFY_FLOW_SOURCE === 'dual';
}

function useWpFallback(): boolean {
  return config.BOTIFY_FLOW_SOURCE === 'wordpress' || config.BOTIFY_FLOW_SOURCE === 'dual';
}

export async function resolveConversation(
  botId: string,
  contactPhone: string,
  contactName?: string,
): Promise<string | null> {
  if (useOmniFirst()) {
    const id = await omniResolveConversation(botId, contactPhone, contactName);
    if (id) return id;
    if (config.BOTIFY_FLOW_SOURCE === 'omniconnect') return null;
  }
  if (useWpFallback()) {
    return wp().resolveConversation(botId, contactPhone, contactName);
  }
  return null;
}

function omniConfigured(): boolean {
  return Boolean(
    config.OMNICONNECT_BACKEND_URL?.trim() &&
      config.BOTIFY_INTERNAL_SYNC_SECRET?.trim() &&
      config.OMNICONNECT_BOTIFY_TENANT_ID?.trim(),
  );
}

export async function saveMessage(data: {
  botId?: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const payload = {
    conversationId: data.conversationId,
    role: data.role,
    content: data.content,
    metadata: data.metadata,
  };
  if (config.BOTIFY_FLOW_SOURCE === 'omniconnect' && omniConfigured()) {
    await omniSaveMessage(payload);
    return;
  }
  if (config.BOTIFY_FLOW_SOURCE === 'dual' && omniConfigured()) {
    await omniSaveMessage(payload);
    return;
  }
  if (useWpFallback()) {
    await wp().saveMessage(data);
  }
}

export async function listConversationMessages(
  conversationId: string,
  limit = 40,
): Promise<
  Array<{
    direction: string;
    content: string;
    mediaUrl?: string | null;
  }>
> {
  if (useOmniFirst()) {
    const rows = await omniListConversationMessages(conversationId, limit);
    if (rows.length > 0 || config.BOTIFY_FLOW_SOURCE === 'omniconnect') {
      return rows;
    }
  }
  if (useWpFallback()) {
    return wp().listConversationMessages(conversationId, limit);
  }
  return [];
}

export async function sendWhatsAppMessage(data: {
  botId?: string;
  conversationId?: string;
  message: string;
}): Promise<boolean> {
  if (useOmniFirst() && data.conversationId) {
    const ok = await omniSendWhatsAppMessage({
      conversationId: data.conversationId,
      message: data.message,
    });
    if (ok || config.BOTIFY_FLOW_SOURCE === 'omniconnect') {
      return ok;
    }
  }
  if (useWpFallback()) {
    return wp().sendWhatsAppMessage(data);
  }
  return false;
}

/** Extrai config IA do nó no grafo (modo Omni); fallback WP API. */
export async function getAINodeConfig(
  flowId: string,
  nodeId: string,
  aiNode?: { data?: Record<string, unknown> },
): Promise<{
  provider?: string;
  model?: string;
  system_prompt?: string;
  user_prompt_template?: string;
  temperature?: number;
  max_tokens?: number;
} | null> {
  const data = aiNode?.data;
  if (data && (config.BOTIFY_FLOW_SOURCE === 'omniconnect' || config.BOTIFY_FLOW_SOURCE === 'dual')) {
    const cfg =
      data.config && typeof data.config === 'object' && !Array.isArray(data.config)
        ? (data.config as Record<string, unknown>)
        : {};
    const merged = { ...data, ...cfg };
    return {
      provider: (merged.provider as string) || 'openai',
      model: (merged.model as string) || 'gpt-4o-mini',
      system_prompt: (merged.systemPrompt as string) || (merged.system_prompt as string),
      user_prompt_template:
        (merged.userPromptTemplate as string) ||
        (merged.user_prompt_template as string) ||
        '{{user_message}}',
      temperature:
        typeof merged.temperature === 'number'
          ? merged.temperature
          : Number(merged.temperature) || 0.7,
      max_tokens:
        typeof merged.maxTokens === 'number'
          ? merged.maxTokens
          : typeof merged.max_tokens === 'number'
            ? merged.max_tokens
            : 500,
    };
  }
  if (config.BOTIFY_FLOW_SOURCE !== 'omniconnect') {
    return wp().getAINodeConfig(flowId, nodeId);
  }
  return null;
}
