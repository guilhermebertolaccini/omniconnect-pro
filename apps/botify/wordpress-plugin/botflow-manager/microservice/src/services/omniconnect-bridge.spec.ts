import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emitBotifyHandoffToOmniconnect } from './omniconnect-bridge.js';

describe('emitBotifyHandoffToOmniconnect', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '',
      } as Response),
    );
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it('does not call fetch when OMNICONNECT_API_URL is missing', async () => {
    delete process.env.OMNICONNECT_API_URL;
    process.env.OMNICONNECT_BOT_BRIDGE_CONNECTION_ID = 'cid';
    process.env.OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET = 'sec';

    await emitBotifyHandoffToOmniconnect({
      phone: '5511999990001',
      externalId: 'botify:flow:f1:conv:9:transfer',
    });

    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it('POSTs signed payload to /webhooks/botify when fully configured', async () => {
    process.env.OMNICONNECT_API_URL = 'https://api.example.com';
    process.env.OMNICONNECT_BOT_BRIDGE_CONNECTION_ID = 'conn-uuid-1';
    process.env.OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET = 'supersecret';

    await emitBotifyHandoffToOmniconnect({
      phone: '5511999990001',
      externalId: 'botify:flow:f1:conv:9:transfer',
      name: 'Jo',
      message: 'Oi',
      segment: 2,
      leadSummary: {
        intent: 'test',
        lastUserMessage: 'hello',
      },
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/webhooks/botify');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-integration-id']).toBe('conn-uuid-1');
    expect(headers['idempotency-key']).toBe('botify:handoff:botify:flow:f1:conv:9:transfer');
    expect(headers['x-signature']).toMatch(/^[0-9a-f]{64}$/);

    const body = JSON.parse(init.body as string);
    expect(body.eventType).toBe('botify.handoff.created');
    expect(body.externalId).toBe('botify:flow:f1:conv:9:transfer');
    expect(body.data.phone).toMatch(/^\+/);
    expect(body.data.name).toBe('Jo');
    expect(body.data.message).toBe('Oi');
    expect(body.data.segment).toBe(2);
    expect(body.data.leadSummary).toEqual({
      intent: 'test',
      lastUserMessage: 'hello',
    });
  });
});
