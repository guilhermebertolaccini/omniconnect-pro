// ============= API Response Types =============

export interface APIResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// ============= Authentication Types =============

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  /** WordPress login or Omni email when VITE_BOTIFY_AUTH_SOURCE=omniconnect */
  username: string;
  password: string;
  /** Optional explicit email for Omni auth */
  email?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ============= Meta Account Types =============

export interface MetaAccount {
  id: number;
  userId: number;
  accountName: string;
  accessToken?: string; // Not returned from API for security
  tokenExpiresAt: string | null;
  webhookCallbackUrl: string | null;
  webhookVerifyToken: string | null;
  webhookEvents: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MetaAccountCreateInput {
  accountName: string;
  accessToken: string;
  tokenExpiresAt?: string;
  webhookCallbackUrl?: string;
  webhookVerifyToken?: string;
  webhookEvents?: string[];
}

export interface MetaAccountUpdateInput {
  accountName?: string;
  accessToken?: string;
  tokenExpiresAt?: string;
  webhookCallbackUrl?: string;
  webhookVerifyToken?: string;
  webhookEvents?: string[];
  isActive?: boolean;
}

// ============= AI Configuration Types =============

export type AIProvider = 'lovable' | 'gemini' | 'openai';

export interface AINodeConfig {
  id: number;
  flowId: number;
  nodeId: string;
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  userPromptTemplate: string;
  temperature: number;
  maxTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface AINodeConfigInput {
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
  userPromptTemplate?: string;
  temperature?: number;
  maxTokens?: number;
}

// ============= Webhook Log Types =============

export type WebhookProvider = 'meta' | 'evolution';
export type WebhookStatus = 'received' | 'processed' | 'failed';

export interface WebhookLog {
  id: number;
  accountId: string;
  wabaId?: string;
  instanceName?: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: WebhookStatus;
  errorMessage?: string;
  createdAt: string;
}

export interface WebhookLogFilters {
  provider?: WebhookProvider;
  accountId?: string;
  eventType?: string;
  status?: WebhookStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  perPage?: number;
}

// ============= Evolution API Types =============

export interface EvolutionInstance {
  id: number;
  instanceName: string;
  apiKey: string;
  status: 'connected' | 'disconnected' | 'connecting';
  qrCode?: string;
  webhookUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvolutionInstanceCreateInput {
  instanceName: string;
  webhookUrl?: string;
}

// ============= Microservice Types =============

export interface MicroserviceHealth {
  status: 'ok' | 'error';
  timestamp: string;
  services: {
    wordpress: boolean;
    redis?: boolean;
  };
}

export interface AIProcessRequest {
  flowId: string;
  nodeId: string;
  conversationId: string;
  userMessage: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  config?: Partial<AINodeConfigInput>;
}

export interface AIProcessResponse {
  success: boolean;
  response: string;
  provider: AIProvider;
  model: string;
  tokensUsed?: number;
  processingTimeMs: number;
}

// ============= SSE Event Types =============

export type SSEEventType = 
  | 'connected'
  | 'message_received'
  | 'message_sent'
  | 'ai_processing'
  | 'ai_response'
  | 'ai_token'
  | 'ai_complete'
  | 'webhook_received'
  | 'error';

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: string;
}

export interface MessageReceivedEvent {
  conversationId: string;
  message: {
    id: string;
    from: string;
    content: string;
    timestamp: string;
  };
}

export interface AITokenEvent {
  requestId: string;
  token: string;
  index: number;
}

export interface AICompleteEvent {
  requestId: string;
  fullResponse: string;
  tokensUsed: number;
  processingTimeMs: number;
}
