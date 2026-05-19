import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { Message, AIProcessResult, StreamCallbacks } from '../ai-processor.js';

const LOVABLE_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

export interface CompletionRequest {
  messages: Message[];
  model?: string;
  temperature: number;
  maxTokens: number;
}

export class LovableProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = config.LOVABLE_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('LOVABLE_API_KEY not configured');
    }
  }

  async complete(request: CompletionRequest): Promise<AIProcessResult> {
    if (!this.apiKey) {
      throw new Error('Lovable API key not configured');
    }

    const model = request.model || DEFAULT_MODEL;

    const response = await fetch(LOVABLE_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your Lovable workspace.');
      }
      
      throw new Error(`Lovable API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    return {
      response: data.choices[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens || 0,
      provider: 'lovable',
      model,
    };
  }

  async stream(request: CompletionRequest, callbacks: StreamCallbacks): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Lovable API key not configured');
    }

    const model = request.model || DEFAULT_MODEL;

    const response = await fetch(LOVABLE_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 429) {
        callbacks.onError(new Error('Rate limit exceeded. Please try again later.'));
        return;
      }
      if (response.status === 402) {
        callbacks.onError(new Error('Payment required. Please add credits to your Lovable workspace.'));
        return;
      }
      
      callbacks.onError(new Error(`Lovable API error: ${response.status} - ${errorText}`));
      return;
    }

    if (!response.body) {
      callbacks.onError(new Error('No response body'));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let textBuffer = '';
    let tokensUsed = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            
            if (content) {
              fullResponse += content;
              callbacks.onToken(content);
            }

            // Try to get usage from final message
            if (parsed.usage?.total_tokens) {
              tokensUsed = parsed.usage.total_tokens;
            }
          } catch {
            // Incomplete JSON, put back and wait for more data
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      callbacks.onComplete({
        response: fullResponse,
        tokensUsed,
        provider: 'lovable',
        model,
      });
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error('Stream error'));
    }
  }
}
