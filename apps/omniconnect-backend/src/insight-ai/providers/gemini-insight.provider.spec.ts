import { ConfigService } from '@nestjs/config';
import { GeminiInsightProvider } from './gemini-insight.provider';

describe('GeminiInsightProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeConfig(gemini?: string, google?: string): ConfigService {
    return {
      get: jest.fn((k: string) => {
        if (k === 'GEMINI_API_KEY') return gemini;
        if (k === 'GOOGLE_AI_API_KEY') return google;
        return undefined;
      }),
    } as unknown as ConfigService;
  }

  it('isConfigured prefers GEMINI_API_KEY then GOOGLE_AI_API_KEY', () => {
    expect(new GeminiInsightProvider(makeConfig(undefined, undefined)).isConfigured()).toBe(false);
    expect(new GeminiInsightProvider(makeConfig('a', undefined)).isConfigured()).toBe(true);
    expect(new GeminiInsightProvider(makeConfig(undefined, 'b')).isConfigured()).toBe(true);
  });

  it('POSTs generateContent with JSON MIME and maps usage', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"leadIntent":"pesquisa"}' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 9 },
      }),
    }) as unknown as typeof fetch;

    const provider = new GeminiInsightProvider(makeConfig('AIza', undefined));
    const out = await provider.completeJson({
      tenantId: 't',
      userPrompt: 'hi',
      modelRef: 'gemini-2.0-flash',
    });

    expect(out.rawText).toBe('{"leadIntent":"pesquisa"}');
    expect(out.promptTokens).toBe(5);
    expect(out.completionTokens).toBe(9);

    const callUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(callUrl).toContain('generativelanguage.googleapis.com');
    expect(callUrl).toContain(encodeURIComponent('gemini-2.0-flash'));
    expect(callUrl).toContain('key=');
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[0].text).toBe('hi');
  });

  it('throws on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad',
    }) as unknown as typeof fetch;

    await expect(
      new GeminiInsightProvider(makeConfig('k', undefined)).completeJson({
        tenantId: 't',
        userPrompt: 'p',
        modelRef: 'gemini-2.0-flash',
      }),
    ).rejects.toThrow(/Gemini HTTP 400/);
  });
});
