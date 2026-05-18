import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  InsightAiCompletionRequest,
  InsightAiCompletionResult,
  InsightAiLlmProvider,
} from './insight-ai-llm.types';

const DEFAULT_SYSTEM =
  'Você é um analista sênior de conversão comercial imobiliária. Responda somente JSON válido.';

/**
 * OpenAI Chat Completions (JSON mode) adapter for InsightAI.
 * Network + parsing only — pricing and `AIUsageLog` stay in {@link InsightAiService}.
 */
@Injectable()
export class OpenAiInsightProvider implements InsightAiLlmProvider {
  readonly id = 'openai';
  private readonly logger = new Logger(OpenAiInsightProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('OPENAI_API_KEY')?.trim();
  }

  async completeJson(req: InsightAiCompletionRequest): Promise<InsightAiCompletionResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey || !apiKey.trim()) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const model = req.modelRef.trim() || this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    const system = req.systemPrompt?.trim() || DEFAULT_SYSTEM;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: req.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content;
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };

    if (!content) {
      this.logger.warn('OpenAI returned empty message content');
      throw new Error('Resposta vazia da OpenAI.');
    }

    return {
      rawText: content,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    };
  }
}
