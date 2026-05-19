import type {
  AIProcessRequest,
  AIProcessResponse,
  MicroserviceHealth,
  SSEEvent,
  SSEEventType,
} from '@/types/api';

// Microservice API base URL
const MICROSERVICE_URL = import.meta.env.VITE_MICROSERVICE_URL || '';
const API_KEY = import.meta.env.VITE_MICROSERVICE_API_KEY || '';

// Token storage key (shared with WordPress API)
const TOKEN_KEY = 'botflow_access_token';

type SSECallback<T = unknown> = (event: SSEEvent<T>) => void;

interface StreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (response: string, tokensUsed: number) => void;
  onError?: (error: Error) => void;
}

class MicroserviceAPIService {
  private baseUrl: string;
  private apiKey: string;
  private eventSource: EventSource | null = null;
  private eventListeners: Map<SSEEventType, Set<SSECallback>> = new Map();

  constructor() {
    this.baseUrl = MICROSERVICE_URL;
    this.apiKey = API_KEY;
  }

  // ============= Headers =============

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  // ============= HTTP Client =============

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      throw new MicroserviceError('Microservice URL not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Microservice Error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new MicroserviceError(errorMessage, response.status);
    }

    return response.json();
  }

  // ============= Health Check =============

  async checkHealth(): Promise<MicroserviceHealth> {
    return this.request<MicroserviceHealth>('/health');
  }

  async checkDetailedHealth(): Promise<MicroserviceHealth> {
    return this.request<MicroserviceHealth>('/health/detailed');
  }

  // ============= AI Processing =============

  async processAI(params: AIProcessRequest): Promise<AIProcessResponse> {
    return this.request<AIProcessResponse>('/ai/process', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Process AI with streaming response via SSE
   * Returns a cleanup function to abort the stream
   */
  processAIStream(params: AIProcessRequest, callbacks: StreamCallbacks): () => void {
    if (!this.baseUrl) {
      callbacks.onError?.(new MicroserviceError('Microservice URL not configured'));
      return () => {};
    }

    const abortController = new AbortController();
    let fullResponse = '';

    const fetchStream = async () => {
      try {
        const queryParams = new URLSearchParams({
          flowId: params.flowId,
          nodeId: params.nodeId,
          conversationId: params.conversationId,
          userMessage: params.userMessage,
          history: JSON.stringify(params.conversationHistory ?? []),
          config: JSON.stringify(params.config ?? {}),
        });

        const response = await fetch(`${this.baseUrl}/ai/stream?${queryParams.toString()}`, {
          method: 'GET',
          headers: this.getHeaders(),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new MicroserviceError(`Stream error: ${response.status}`, response.status);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new MicroserviceError('Response body not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent: 'token' | 'done' | 'error' | 'message' = 'message';

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const rawEvent = line.slice(7).trim();
              if (rawEvent === 'token' || rawEvent === 'done' || rawEvent === 'error') {
                currentEvent = rawEvent;
              } else {
                currentEvent = 'message';
              }
              continue;
            }

            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                callbacks.onComplete?.(fullResponse, 0);
                return;
              }

              try {
                const parsed = JSON.parse(data);

                if ((currentEvent === 'token' || parsed.type === 'token') && parsed.token) {
                  fullResponse += parsed.token;
                  callbacks.onToken?.(parsed.token);
                } else if (currentEvent === 'done' || parsed.type === 'complete') {
                  const responseText = parsed.response || fullResponse;
                  const tokensUsed = parsed.tokensUsed || 0;
                  callbacks.onComplete?.(responseText, tokensUsed);
                  return;
                } else if (currentEvent === 'error' || parsed.type === 'error') {
                  throw new MicroserviceError(parsed.error || 'Stream error');
                }
              } catch (e) {
                if (e instanceof MicroserviceError) throw e;
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return; // Stream was cancelled
        }
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    };

    fetchStream();

    return () => {
      abortController.abort();
    };
  }

  /**
   * Test AI configuration with a sample message
   */
  async testAI(config: AIProcessRequest['config'], testMessage: string): Promise<AIProcessResponse> {
    return this.request<AIProcessResponse>('/ai/test', {
      method: 'POST',
      body: JSON.stringify({ config, testMessage }),
    });
  }

  // ============= Real-time Events (SSE) =============

  /**
   * Connect to SSE endpoint for real-time events
   */
  connectToEvents(userId?: string): void {
    if (this.eventSource) {
      this.disconnectFromEvents();
    }

    if (!this.baseUrl) {
      console.error('Microservice URL not configured');
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    const params = new URLSearchParams();
    
    if (userId) params.set('userId', userId);
    if (token) params.set('token', token);

    this.eventSource = new EventSource(`${this.baseUrl}/events/subscribe?${params}`);

    this.eventSource.onopen = () => {
      console.log('SSE connected');
      this.emit('connected', { timestamp: new Date().toISOString() });
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      this.emit('error', { error: 'Connection error', timestamp: new Date().toISOString() });
      
      // Reconnect after delay
      setTimeout(() => {
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.connectToEvents(userId);
        }
      }, 5000);
    };

    // Listen for all event types
    const eventTypes: SSEEventType[] = [
      'message_received',
      'message_sent',
      'ai_processing',
      'ai_response',
      'webhook_received',
    ];

    for (const eventType of eventTypes) {
      this.eventSource.addEventListener(eventType, (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(eventType, data);
        } catch (e) {
          console.error(`Error parsing SSE event ${eventType}:`, e);
        }
      });
    }
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnectFromEvents(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Subscribe to a specific event type
   */
  on<T = unknown>(eventType: SSEEventType, callback: SSECallback<T>): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    
    this.eventListeners.get(eventType)!.add(callback as SSECallback);
    
    // Return unsubscribe function
    return () => {
      this.eventListeners.get(eventType)?.delete(callback as SSECallback);
    };
  }

  /**
   * Emit event to all listeners
   */
  private emit(eventType: SSEEventType, data: unknown): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const event: SSEEvent = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
      };
      listeners.forEach((callback) => callback(event));
    }
  }

  // ============= Webhook Registration =============

  /**
   * Register Meta webhook with microservice
   */
  async registerMetaWebhook(accountId: string, verifyToken: string): Promise<{ callbackUrl: string }> {
    return this.request<{ callbackUrl: string }>('/webhooks/meta/register', {
      method: 'POST',
      body: JSON.stringify({ accountId, verifyToken }),
    });
  }

  /**
   * Register Evolution API webhook with microservice
   */
  async registerEvolutionWebhook(instanceName: string): Promise<{ webhookUrl: string }> {
    return this.request<{ webhookUrl: string }>('/webhooks/evolution/register', {
      method: 'POST',
      body: JSON.stringify({ instanceName }),
    });
  }

  // ============= Status =============

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  isConfigured(): boolean {
    return !!this.baseUrl;
  }
}

// ============= Custom Error Class =============

export class MicroserviceError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'MicroserviceError';
  }
}

// ============= Export Singleton Instance =============

export const microserviceApi = new MicroserviceAPIService();
