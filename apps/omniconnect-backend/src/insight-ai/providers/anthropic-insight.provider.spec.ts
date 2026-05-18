import { ConfigService } from '@nestjs/config';
import { AnthropicInsightProvider } from './anthropic-insight.provider';

describe('AnthropicInsightProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeConfig(key: string | undefined): ConfigService {
    return {
      get: jest.fn((k: string) => (k === 'ANTHROPIC_API_KEY' ? key : undefined)),
    } as unknown as ConfigService;
  }

  it('isConfigured reflects ANTHROPIC_API_KEY', () => {
    expect(new AnthropicInsightProvider(makeConfig(undefined)).isConfigured()).toBe(false);
    expect(new AnthropicInsightProvider(makeConfig('sk-ant')).isConfigured()).toBe(true);
  });

  it('POSTs messages and maps token usage', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '{"summary":"x"}' }],
        usage: { input_tokens: 3, output_tokens: 7 },
      }),
    }) as unknown as typeof fetch;

    const provider = new AnthropicInsightProvider(makeConfig('k'));
    const out = await provider.completeJson({
      tenantId: 't',
      userPrompt: 'prompt',
      modelRef: 'claude-3-5-haiku-20241022',
    });

    expect(out.rawText).toBe('{"summary":"x"}');
    expect(out.promptTokens).toBe(3);
    expect(out.completionTokens).toBe(7);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'k',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.model).toBe('claude-3-5-haiku-20241022');
    expect(body.messages).toEqual([{ role: 'user', content: 'prompt' }]);
  });

  it('throws on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 529,
      text: async () => 'overloaded',
    }) as unknown as typeof fetch;

    await expect(
      new AnthropicInsightProvider(makeConfig('k')).completeJson({
        tenantId: 't',
        userPrompt: 'p',
        modelRef: 'claude-3-5-haiku-20241022',
      }),
    ).rejects.toThrow(/Anthropic HTTP 529/);
  });
});
