import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InsightAiLlmProvider } from './insight-ai-llm.types';
import { OpenAiInsightProvider } from './openai-insight.provider';
import { AnthropicInsightProvider } from './anthropic-insight.provider';
import { GeminiInsightProvider } from './gemini-insight.provider';

/**
 * Maps `INSIGHT_AI_DEFAULT_PROVIDER` to an {@link InsightAiLlmProvider}.
 * Unknown values return null (fall back to heuristic upstream).
 */
@Injectable()
export class InsightAiLlmResolver {
  constructor(
    private readonly config: ConfigService,
    private readonly openai: OpenAiInsightProvider,
    private readonly anthropic: AnthropicInsightProvider,
    private readonly gemini: GeminiInsightProvider,
  ) {}

  resolve(configuredProvider: string): InsightAiLlmProvider | null {
    const p = configuredProvider.trim().toLowerCase();
    if (p === 'openai') return this.openai;
    if (p === 'anthropic') {
      if (this.isEnvTruthy('INSIGHT_AI_ANTHROPIC_DISABLED')) return null;
      return this.anthropic;
    }
    if (p === 'gemini' || p === 'google') {
      if (this.isEnvTruthy('INSIGHT_AI_GEMINI_DISABLED')) return null;
      return this.gemini;
    }
    return null;
  }

  private isEnvTruthy(key: string): boolean {
    const v = this.config.get<string>(key)?.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }
}
