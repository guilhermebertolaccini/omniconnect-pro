import { ConfigService } from '@nestjs/config';
import { InsightAiLlmResolver } from './insight-ai-llm.resolver';
import { OpenAiInsightProvider } from './openai-insight.provider';
import { AnthropicInsightProvider } from './anthropic-insight.provider';
import { GeminiInsightProvider } from './gemini-insight.provider';

describe('InsightAiLlmResolver', () => {
  function makeResolver(env: Record<string, string | undefined> = {}) {
    const config = {
      get: jest.fn((k: string) => env[k]),
    } as unknown as ConfigService;
    const openai = { id: 'openai' } as OpenAiInsightProvider;
    const anthropic = { id: 'anthropic' } as AnthropicInsightProvider;
    const gemini = { id: 'google' } as GeminiInsightProvider;
    return new InsightAiLlmResolver(config, openai, anthropic, gemini);
  }

  it('returns openai for openai', () => {
    const r = makeResolver();
    expect(r.resolve('openai')?.id).toBe('openai');
  });

  it('returns anthropic unless INSIGHT_AI_ANTHROPIC_DISABLED', () => {
    expect(makeResolver({}).resolve('anthropic')?.id).toBe('anthropic');
    expect(makeResolver({ INSIGHT_AI_ANTHROPIC_DISABLED: '1' }).resolve('anthropic')).toBeNull();
    expect(makeResolver({ INSIGHT_AI_ANTHROPIC_DISABLED: 'true' }).resolve('anthropic')).toBeNull();
  });

  it('returns google provider for gemini or google alias', () => {
    const r = makeResolver();
    expect(r.resolve('gemini')?.id).toBe('google');
    expect(r.resolve('GOOGLE')?.id).toBe('google');
  });

  it('returns null for gemini when INSIGHT_AI_GEMINI_DISABLED', () => {
    expect(
      makeResolver({ INSIGHT_AI_GEMINI_DISABLED: 'yes' }).resolve('gemini'),
    ).toBeNull();
  });

  it('returns null for unknown provider id', () => {
    expect(makeResolver().resolve('mistral')).toBeNull();
  });
});
