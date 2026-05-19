import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { Message, AIProcessResult, StreamCallbacks } from '../ai-processor.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

export interface CompletionRequest {
  messages: Message[];
  model?: string;
  temperature: number;
  maxTokens: number;
}

export class GeminiProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = config.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('GEMINI_API_KEY not configured');
    }
  }

  private convertToGeminiFormat(messages: Message[]): { contents: any[]; systemInstruction?: any } {
    const contents: any[] = [];
    let systemInstruction: any = undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { contents, systemInstruction };
  }

  async complete(request: CompletionRequest): Promise<AIProcessResult> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const model = request.model || DEFAULT_MODEL;
    const { contents, systemInstruction } = this.convertToGeminiFormat(request.messages);

    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        systemInstruction,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 429) {
        throw new Error('Gemini rate limit exceeded. Please try again later.');
      }
      if (response.status === 400) {
        throw new Error('Invalid Gemini API key or request.');
      }
      
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokensUsed = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);

    return {
      response: text,
      tokensUsed,
      provider: 'gemini',
      model,
    };
  }

  async stream(request: CompletionRequest, callbacks: StreamCallbacks): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const model = request.model || DEFAULT_MODEL;
    const { contents, systemInstruction } = this.convertToGeminiFormat(request.messages);

    const url = `${GEMINI_API_URL}/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        systemInstruction,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 429) {
        callbacks.onError(new Error('Gemini rate limit exceeded. Please try again later.'));
        return;
      }
      
      callbacks.onError(new Error(`Gemini API error: ${response.status} - ${errorText}`));
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

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (content) {
              fullResponse += content;
              callbacks.onToken(content);
            }

            // Get usage metadata from final chunk
            if (parsed.usageMetadata) {
              tokensUsed = (parsed.usageMetadata.promptTokenCount || 0) + 
                          (parsed.usageMetadata.candidatesTokenCount || 0);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      callbacks.onComplete({
        response: fullResponse,
        tokensUsed,
        provider: 'gemini',
        model,
      });
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error('Stream error'));
    }
  }
}
