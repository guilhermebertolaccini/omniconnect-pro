import type { Bot, ConversationFlow, Conversation, Message, WhatsAppConfig } from '@/types/bot';
import type {
  APIResponse,
  PaginatedResponse,
  AuthTokens,
  LoginCredentials,
  MetaAccount,
  MetaAccountCreateInput,
  MetaAccountUpdateInput,
  AINodeConfig,
  AINodeConfigInput,
  WebhookLog,
  WebhookLogFilters,
  EvolutionInstance,
  EvolutionInstanceCreateInput,
} from '@/types/api';

// WordPress REST API base URL
const WP_API_BASE = import.meta.env.VITE_WORDPRESS_API_URL || '';
const API_VERSION = 'botflow/v1';

// Token storage keys
const TOKEN_KEY = 'botflow_access_token';
const REFRESH_TOKEN_KEY = 'botflow_refresh_token';

class WordPressAPIService {
  private baseUrl: string;
  private authFailureListeners: Set<() => void>;

  constructor() {
    this.baseUrl = `${WP_API_BASE}/wp-json/${API_VERSION}`;
    this.authFailureListeners = new Set();
  }

  private normalizeAuthTokens(tokens: Record<string, unknown>): AuthTokens {
    return {
      accessToken: String(tokens.accessToken ?? tokens.access_token ?? ''),
      refreshToken: String(tokens.refreshToken ?? tokens.refresh_token ?? ''),
      expiresIn: Number(tokens.expiresIn ?? tokens.expires_in ?? 0),
    };
  }

  private toBotPayload(bot: Partial<Bot>): Record<string, unknown> {
    const normalizePhoneNumber = (value?: string): string | undefined => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      if (!trimmed) return '';

      // Keep only digits and optional leading plus for backend E.164 validation.
      const hasPlus = trimmed.startsWith('+');
      const digits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
      return `${hasPlus ? '+' : ''}${digits}`;
    };

    return {
      ...(bot.name !== undefined ? { name: bot.name } : {}),
      ...(bot.description !== undefined ? { description: bot.description } : {}),
      ...(bot.phoneNumber !== undefined ? { phone_number: normalizePhoneNumber(bot.phoneNumber) } : {}),
      ...(bot.status !== undefined ? { status: bot.status } : {}),
      ...(bot.lineHealth !== undefined ? { line_health: bot.lineHealth } : {}),
    };
  }

  // ============= Token Management =============

  private getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  setTokens(tokens: AuthTokens): void {
    localStorage.setItem(TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  clearTokens(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  onAuthFailure(listener: () => void): () => void {
    this.authFailureListeners.add(listener);
    return () => this.authFailureListeners.delete(listener);
  }

  private emitAuthFailure(): void {
    this.authFailureListeners.forEach((listener) => listener());
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  // ============= HTTP Client =============

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getAccessToken();
    if (token) {
      (headers as Record<string, string>)['X-BotFlow-Token'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network request failed';
      throw new APIError(0, `Network error: ${message}`);
    }

    // Handle 401 - try refresh token (except auth endpoints)
    const refreshToken = this.getRefreshToken();
    const isAuthEndpoint = endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/refresh');
    if (response.status === 401 && refreshToken && !isAuthEndpoint) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Retry request with new token
        (headers as Record<string, string>)['X-BotFlow-Token'] = `Bearer ${this.getAccessToken()}`;
        const retryResponse = await fetch(url, { ...options, headers });
        if (!retryResponse.ok) {
          throw new APIError(retryResponse.status, await retryResponse.text());
        }
        return retryResponse.json();
      } else {
        this.clearTokens();
        this.emitAuthFailure();
        throw new APIError(401, 'Session expired. Please login again.');
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API Error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new APIError(response.status, errorMessage);
    }

    return response.json();
  }

  // ============= Authentication =============

  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const response = await this.request<APIResponse<Record<string, unknown>>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    if (response.success && response.data) {
      const tokens = this.normalizeAuthTokens(response.data);
      this.setTokens(tokens);
      return tokens;
    }
    
    throw new APIError(401, response.message || 'Login failed');
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.clearTokens();
    }
  }

  async getCurrentUser(): Promise<{
    id: number;
    email: string;
    display_name: string;
    roles: string[];
  }> {
    const response = await this.request<APIResponse<{
      id: number;
      email: string;
      display_name: string;
      roles: string[];
    }>>('/auth/me');
    return response.data;
  }

  private async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BotFlow-Token': `Bearer ${refreshToken}`,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.ok) {
        const data: APIResponse<Record<string, unknown>> = await response.json();
        if (data.success && data.data) {
          this.setTokens(this.normalizeAuthTokens(data.data));
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  // ============= Bots =============

  private normalizeBot(raw: Record<string, unknown>): Bot {
    const parseDate = (v: unknown): Date => {
      if (!v) return new Date();
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? new Date() : d;
    };

    return {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? ''),
      description: String(raw.description ?? ''),
      phoneNumber: String(raw.phoneNumber ?? raw.phone_number ?? ''),
      status: (raw.status as Bot['status']) || 'offline',
      lineHealth: (raw.lineHealth ?? raw.line_health ?? 'disconnected') as Bot['lineHealth'],
      messagesReceived: Number(raw.messagesReceived ?? raw.messages_received ?? 0),
      messagesSent: Number(raw.messagesSent ?? raw.messages_sent ?? 0),
      activeConversations: Number(raw.activeConversations ?? raw.active_conversations ?? 0),
      lastActivity: parseDate(raw.lastActivity ?? raw.last_activity),
      createdAt: parseDate(raw.createdAt ?? raw.created_at),
    };
  }

  async getBots(): Promise<Bot[]> {
    const response = await this.request<APIResponse<Record<string, unknown>[]>>('/bots');
    return (response.data || []).map((b) => this.normalizeBot(b));
  }

  async getBot(id: string): Promise<Bot> {
    const response = await this.request<APIResponse<Record<string, unknown>>>(`/bots/${id}`);
    return this.normalizeBot(response.data);
  }

  async createBot(bot: Omit<Bot, 'id' | 'createdAt'>): Promise<Bot> {
    const response = await this.request<APIResponse<Record<string, unknown>>>('/bots', {
      method: 'POST',
      body: JSON.stringify(this.toBotPayload(bot)),
    });
    return this.normalizeBot(response.data);
  }

  async updateBot(id: string, updates: Partial<Bot>): Promise<Bot> {
    const response = await this.request<APIResponse<Record<string, unknown>>>(`/bots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(this.toBotPayload(updates)),
    });
    return this.normalizeBot(response.data);
  }

  async deleteBot(id: string): Promise<void> {
    await this.request(`/bots/${id}`, { method: 'DELETE' });
  }

  // ============= Conversation Flows =============

  async getFlows(botId?: string): Promise<ConversationFlow[]> {
    const params = botId ? `?bot_id=${botId}` : '';
    const response = await this.request<APIResponse<ConversationFlow[]>>(`/flows${params}`);
    return response.data || [];
  }

  async getFlow(id: string): Promise<ConversationFlow> {
    const response = await this.request<APIResponse<ConversationFlow>>(`/flows/${id}`);
    return response.data;
  }

  private toFlowPayload(flow: Partial<ConversationFlow>): Record<string, unknown> {
    return {
      ...(flow.botId !== undefined ? { bot_id: flow.botId } : {}),
      ...(flow.name !== undefined ? { name: flow.name } : {}),
      ...(flow.triggerKeyword !== undefined ? { trigger_keyword: flow.triggerKeyword } : {}),
      ...(flow.nodes !== undefined ? { nodes: flow.nodes } : {}),
      ...(flow.isActive !== undefined ? { is_active: flow.isActive } : {}),
    };
  }

  async createFlow(flow: Omit<ConversationFlow, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConversationFlow> {
    const response = await this.request<APIResponse<ConversationFlow>>('/flows', {
      method: 'POST',
      body: JSON.stringify(this.toFlowPayload(flow)),
    });
    return response.data;
  }

  async updateFlow(id: string, updates: Partial<ConversationFlow>): Promise<ConversationFlow> {
    const response = await this.request<APIResponse<ConversationFlow>>(`/flows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(this.toFlowPayload(updates)),
    });
    return response.data;
  }

  async deleteFlow(id: string): Promise<void> {
    await this.request(`/flows/${id}`, { method: 'DELETE' });
  }

  // ============= Conversations & Messages =============

  async getConversations(botId?: string, page = 1, perPage = 20): Promise<PaginatedResponse<Conversation>> {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (botId) params.set('bot_id', botId);
    
    return this.request<PaginatedResponse<Conversation>>(`/conversations?${params}`);
  }

  async getMessages(conversationId: string, page = 1, perPage = 50): Promise<PaginatedResponse<Message>> {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    const response = await this.request<PaginatedResponse<Message> | APIResponse<Message[]>>(
      `/conversations/${conversationId}/messages?${params}`
    );

    if ('pagination' in response) {
      return response;
    }

    return {
      success: response.success,
      data: response.data || [],
      pagination: {
        page,
        perPage,
        total: (response.data || []).length,
        totalPages: 1,
      },
    };
  }

  async sendMessage(conversationId: string, content: string): Promise<Message> {
    const response = await this.request<APIResponse<Message>>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return response.data;
  }

  // ============= WhatsApp Configuration =============

  async getWhatsAppConfig(botId: string): Promise<WhatsAppConfig | null> {
    try {
      const response = await this.request<APIResponse<WhatsAppConfig>>(`/whatsapp-config/${botId}`);
      return response.data;
    } catch (error) {
      if (error instanceof APIError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async updateWhatsAppConfig(botId: string, config: Partial<WhatsAppConfig>): Promise<WhatsAppConfig> {
    const response = await this.request<APIResponse<WhatsAppConfig>>(`/whatsapp-config/${botId}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    return response.data;
  }

  // ============= Meta Accounts =============

  async getMetaAccounts(): Promise<MetaAccount[]> {
    const response = await this.request<APIResponse<MetaAccount[]>>('/meta-accounts');
    return response.data || [];
  }

  async getMetaAccount(id: number): Promise<MetaAccount> {
    const response = await this.request<APIResponse<MetaAccount>>(`/meta-accounts/${id}`);
    return response.data;
  }

  async createMetaAccount(account: MetaAccountCreateInput): Promise<MetaAccount> {
    const response = await this.request<APIResponse<MetaAccount>>('/meta-accounts', {
      method: 'POST',
      body: JSON.stringify(account),
    });
    return response.data;
  }

  async updateMetaAccount(id: number, updates: MetaAccountUpdateInput): Promise<MetaAccount> {
    const response = await this.request<APIResponse<MetaAccount>>(`/meta-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.data;
  }

  async deleteMetaAccount(id: number): Promise<void> {
    await this.request(`/meta-accounts/${id}`, { method: 'DELETE' });
  }

  // ============= AI Configuration =============

  async getAIConfigs(flowId: string): Promise<AINodeConfig[]> {
    const response = await this.request<APIResponse<AINodeConfig[]>>(`/ai-config/${flowId}`);
    return response.data || [];
  }

  async getAIConfig(flowId: string, nodeId: string): Promise<AINodeConfig | null> {
    try {
      const response = await this.request<APIResponse<AINodeConfig>>(`/ai-config/${flowId}/${nodeId}`);
      return response.data;
    } catch (error) {
      if (error instanceof APIError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async saveAIConfig(flowId: string, nodeId: string, config: AINodeConfigInput): Promise<AINodeConfig> {
    const response = await this.request<APIResponse<AINodeConfig>>(`/ai-config/${flowId}/${nodeId}`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
    return response.data;
  }

  async deleteAIConfig(flowId: string, nodeId: string): Promise<void> {
    await this.request(`/ai-config/${flowId}/${nodeId}`, { method: 'DELETE' });
  }

  // ============= Webhook Logs =============

  async getWebhookLogs(filters: WebhookLogFilters = {}): Promise<PaginatedResponse<WebhookLog>> {
    const params = new URLSearchParams();
    
    if (filters.provider) params.set('provider', filters.provider);
    if (filters.accountId) params.set('account_id', filters.accountId);
    if (filters.eventType) params.set('event_type', filters.eventType);
    if (filters.status) params.set('status', filters.status);
    if (filters.startDate) params.set('start_date', filters.startDate);
    if (filters.endDate) params.set('end_date', filters.endDate);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.perPage) params.set('per_page', String(filters.perPage));

    return this.request<PaginatedResponse<WebhookLog>>(`/webhook-logs?${params}`);
  }

  // ============= Evolution API Instances =============

  async getEvolutionInstances(): Promise<EvolutionInstance[]> {
    const response = await this.request<APIResponse<EvolutionInstance[]>>('/evolution/instances');
    return response.data || [];
  }

  async createEvolutionInstance(data: EvolutionInstanceCreateInput): Promise<EvolutionInstance> {
    const response = await this.request<APIResponse<EvolutionInstance>>('/evolution/instances', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data;
  }

  async deleteEvolutionInstance(id: number): Promise<void> {
    await this.request(`/evolution/instances/${id}`, { method: 'DELETE' });
  }

  async getEvolutionQRCode(instanceId: number): Promise<{ qrCode: string }> {
    const response = await this.request<APIResponse<{ qrCode: string }>>(`/evolution/instances/${instanceId}/qrcode`);
    return response.data;
  }

  // ============= Health Check =============

  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    return this.request<{ status: string; timestamp: string }>('/health');
  }
}

// ============= Custom Error Class =============

export class APIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// ============= Export Singleton Instance =============

export const wpApi = new WordPressAPIService();
