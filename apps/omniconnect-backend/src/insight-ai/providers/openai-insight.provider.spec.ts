import { ConfigService } from '@nestjs/config';
import { OpenAiInsightProvider } from './openai-insight.provider';

describe('OpenAiInsightProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeConfig(apiKey: string | undefined): ConfigService {
    return { get: jest.fn((key: string) => (key === 'OPENAI_API_KEY' ? apiKey : undefined)) } as unknown as ConfigService;
  }

  it('isConfigured reflects OPENAI_API_KEY', () => {
    expect(new OpenAiInsightProvider(makeConfig(undefined)).isConfigured()).toBe(false);
    expect(new OpenAiInsightProvider(makeConfig('sk')).isConfigured()).toBe(true);
    expect(new OpenAiInsightProvider(makeConfig('  ')).isConfigured()).toBe(false);
  });

  it('POSTs chat/completions with json_object and returns usage', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"ok"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
    }) as unknown as typeof fetch;

    const provider = new OpenAiInsightProvider(makeConfig('sk-test'));
    const out = await provider.completeJson({
      tenantId: 't1',
      userPrompt: 'hello',
      modelRef: 'gpt-4o-mini',
    });

    expect(out.rawText).toBe('{"summary":"ok"}');
    expect(out.promptTokens).toBe(10);
    expect(out.completionTokens).toBe(20);
    expect(provider.id).toBe('openai');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([
      {
        role: 'system',
        content: expect.stringContaining('analista'),
      },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('throws when API key is missing', async () => {
    const provider = new OpenAiInsightProvider(makeConfig(undefined));
    await expect(
      provider.completeJson({ tenantId: 't1', userPrompt: 'x', modelRef: 'gpt-4o-mini' }),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('throws on non-OK HTTP', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limit',
    }) as unknown as typeof fetch;

    const provider = new OpenAiInsightProvider(makeConfig('sk'));
    await expect(
      provider.completeJson({ tenantId: 't1', userPrompt: 'x', modelRef: 'gpt-4o-mini' }),
    ).rejects.toThrow(/OpenAI HTTP 429/);
  });
});
