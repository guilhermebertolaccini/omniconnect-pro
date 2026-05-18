import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  InsightAiCompletionRequest,
  InsightAiCompletionResult,
  InsightAiLlmProvider,
} from './insight-ai-llm.types';

const DEFAULT_SYSTEM =
  'Você é um analista sênior de conversão comercial imobiliária. Responda somente JSON válido, sem markdown.';

/**
 * Anthropic Messages API — text JSON output (no tools).
 * https://docs.anthropic.com/en/api/messages
 */
@Injectable()
export class AnthropicInsightProvider implements InsightAiLlmProvider {
  readonly id = 'anthropic';
  private readonly logger = new Logger(AnthropicInsightProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('ANTHROPIC_API_KEY')?.trim();
  }

  async completeJson(req: InsightAiCompletionRequest): Promise<InsightAiCompletionResult> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey?.trim()) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const model =
      req.modelRef.trim() ||
      this.config.get<string>('ANTHROPIC_MODEL') ||
      'claude-3-5-haiku-20241022';
    const system = req.systemPrompt?.trim() || DEFAULT_SYSTEM;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.1,
        system,
        messages: [{ role: 'user', content: req.userPrompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic HTTP ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const textBlock = data.content?.find((c) => c.type === 'text' && c.text);
    const rawText = textBlock?.text;
    const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };

    if (!rawText?.trim()) {
      this.logger.warn('Anthropic returned no text content');
      throw new Error('Resposta vazia da Anthropic.');
    }

    return {
      rawText,
      promptTokens: usage.input_tokens ?? 0,
      completionTokens: usage.output_tokens ?? 0,
    };
  }
}
