import type { BotifyFlowNode } from '@omniconnect/shared-types';

export type BotStatus = 'online' | 'offline' | 'error' | 'connecting';
export type LineHealth = 'healthy' | 'degraded' | 'disconnected';

export interface Bot {
  id: string;
  name: string;
  description: string;
  status: BotStatus;
  lineHealth: LineHealth;
  phoneNumber: string;
  messagesReceived: number;
  messagesSent: number;
  activeConversations: number;
  lastActivity: Date;
  createdAt: Date;
}

/** @deprecated Use `BotifyFlowNode` from `@omniconnect/shared-types` */
export type FlowNode = BotifyFlowNode;

export interface ConversationFlow {
  id: string;
  botId: string;
  name: string;
  triggerKeyword: string;
  nodes: FlowNode[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  botId: string;
  conversationId: string;
  direction: 'incoming' | 'outgoing';
  content: string;
  senderName: string;
  senderPhone: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface Conversation {
  id: string;
  botId: string;
  contactName: string;
  contactPhone: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  messages: Message[];
}

export interface WhatsAppConfig {
  botId: string;
  businessAccountId: string;
  phoneNumberId: string;
  accessToken: string;
  webhookUrl: string;
  webhookSecret: string;
  isConnected: boolean;
}
