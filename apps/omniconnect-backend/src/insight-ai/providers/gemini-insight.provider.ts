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
 * Google Gemini `generateContent` (JSON MIME type).
 * API key: `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY`.
 * `modelProvider` / billing id: **google**.
 */
@Injectable()
export class GeminiInsightProvider implements InsightAiLlmProvider {
  readonly id = 'google';
  private readonly logger = new Logger(GeminiInsightProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.resolveApiKey();
  }

  async completeJson(req: InsightAiCompletionRequest): Promise<InsightAiCompletionResult> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_AI_API_KEY not configured');
    }

    const model =
      req.modelRef.trim() ||
      this.config.get<string>('GEMINI_MODEL') ||
      'gemini-2.0-flash';
    const system = req.systemPrompt?.trim() || DEFAULT_SYSTEM;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: req.userPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini HTTP ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const meta = data.usageMetadata ?? {};

    if (!rawText?.trim()) {
      this.logger.warn('Gemini returned no candidate text');
      throw new Error('Resposta vazia do Gemini.');
    }

    return {
      rawText,
      promptTokens: meta.promptTokenCount ?? 0,
      completionTokens: meta.candidatesTokenCount ?? 0,
    };
  }

  private resolveApiKey(): string | undefined {
    const a = this.config.get<string>('GEMINI_API_KEY')?.trim();
    if (a) return a;
    return this.config.get<string>('GOOGLE_AI_API_KEY')?.trim();
  }
}
