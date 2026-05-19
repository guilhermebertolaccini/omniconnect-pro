import { LovableProvider } from './providers/lovable.js';
import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { WordPressClient } from './wordpress-client.js';
import { logger } from '../utils/logger.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIProcessRequest {
  flowId: string;
  nodeId: string;
  conversationId: string;
  userMessage: string;
  conversationHistory: Message[];
  variables: Record<string, string>;
  config: {
    provider: 'lovable' | 'openai' | 'gemini';
    model?: string;
    systemPrompt?: string;
    userPromptTemplate: string;
    temperature: number;
    maxTokens: number;
  };
}

export interface AIProcessResult {
  response: string;
  tokensUsed: number;
  provider: string;
  model: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (result: AIProcessResult) => void;
  onError: (error: Error) => void;
}

export class AIProcessor {
  private lovableProvider: LovableProvider;
  private openaiProvider: OpenAIProvider;
  private geminiProvider: GeminiProvider;
  private wpClient: WordPressClient;

  constructor() {
    this.lovableProvider = new LovableProvider();
    this.openaiProvider = new OpenAIProvider();
    this.geminiProvider = new GeminiProvider();
    this.wpClient = new WordPressClient();
  }

  async process(request: AIProcessRequest): Promise<AIProcessResult> {
    const { config, userMessage, conversationHistory, variables } = request;

    // Process template variables
    const processedPrompt = this.processTemplate(config.userPromptTemplate, {
      user_message: userMessage,
      conversation_history: this.formatHistory(conversationHistory),
      current_date: new Date().toISOString(),
      current_time: new Date().toLocaleTimeString(),
      ...variables,
    });

    // Build messages array
    const messages: Message[] = [];
    
    if (config.systemPrompt) {
      messages.push({ role: 'system', content: config.systemPrompt });
    }

    // Add conversation history
    messages.push(...conversationHistory);

    // Add current user message (processed)
    messages.push({ role: 'user', content: processedPrompt });

    // Get provider
    const provider = this.getProvider(config.provider);

    // Process request
    const result = await provider.complete({
      messages,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    // Log to WordPress (non-blocking)
    this.logToWordPress(request, result).catch(err => {
      logger.error('Failed to log AI result to WordPress:', err);
    });

    return result;
  }

  async processStream(request: AIProcessRequest, callbacks: StreamCallbacks): Promise<void> {
    const { config, userMessage, conversationHistory, variables } = request;

    try {
      // Process template variables
      const processedPrompt = this.processTemplate(config.userPromptTemplate, {
        user_message: userMessage,
        conversation_history: this.formatHistory(conversationHistory),
        current_date: new Date().toISOString(),
        current_time: new Date().toLocaleTimeString(),
        ...variables,
      });

      // Build messages array
      const messages: Message[] = [];
      
      if (config.systemPrompt) {
        messages.push({ role: 'system', content: config.systemPrompt });
      }

      messages.push(...conversationHistory);
      messages.push({ role: 'user', content: processedPrompt });

      // Get provider
      const provider = this.getProvider(config.provider);

      // Stream request
      await provider.stream(
        {
          messages,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        },
        {
          onToken: callbacks.onToken,
          onComplete: (result) => {
            // Log to WordPress (non-blocking)
            this.logToWordPress(request, result).catch(err => {
              logger.error('Failed to log AI result to WordPress:', err);
            });
            callbacks.onComplete(result);
          },
          onError: callbacks.onError,
        }
      );
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  private getProvider(providerName: string): LovableProvider | OpenAIProvider | GeminiProvider {
    switch (providerName) {
      case 'lovable':
        return this.lovableProvider;
      case 'openai':
        return this.openaiProvider;
      case 'gemini':
        return this.geminiProvider;
      default:
        logger.warn(`Unknown provider: ${providerName}, falling back to Lovable`);
        return this.lovableProvider;
    }
  }

  private processTemplate(template: string, variables: Record<string, string>): string {
    let processed = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      processed = processed.replace(regex, value || '');
    }

    return processed;
  }

  private formatHistory(history: Message[]): string {
    if (history.length === 0) return '';

    return history
      .map(msg => `${msg.role === 'user' ? 'Usuário' : 'Assistente'}: ${msg.content}`)
      .join('\n');
  }

  private async logToWordPress(request: AIProcessRequest, result: AIProcessResult): Promise<void> {
    await this.wpClient.logAIProcessing({
      flowId: request.flowId,
      nodeId: request.nodeId,
      conversationId: request.conversationId,
      userMessage: request.userMessage,
      aiResponse: result.response,
      provider: result.provider,
      model: result.model,
      tokensUsed: result.tokensUsed,
    });
  }
}
