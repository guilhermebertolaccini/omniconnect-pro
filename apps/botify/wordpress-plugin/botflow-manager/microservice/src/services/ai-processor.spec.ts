import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Spec do contrato G7 (ADR-0002): em modo `omniconnect`, o AI processor
 * NÃO escreve no WordPress. A telemetria de IA fica como structured log
 * local — a fonte de verdade do histórico é `BotifyMessage.metadata`
 * gravado pelo engine G3 (ver `botify-flow-engine.service.ts`).
 *
 * Em `wordpress`/`dual`, o write WP continua acontecendo (back-compat
 * com instalações legadas até desligar o plugin).
 */

const { cfg, logger, logAIProcessing } = vi.hoisted(() => ({
  cfg: {
    BOTIFY_FLOW_SOURCE: 'wordpress' as 'wordpress' | 'omniconnect' | 'dual',
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logAIProcessing: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config.js', () => ({ config: cfg }));
vi.mock('../utils/logger.js', () => ({ logger }));
vi.mock('./wordpress-client.js', () => ({
  WordPressClient: class {
    logAIProcessing = logAIProcessing;
  },
}));
// Os providers AI não rodam neste spec (testamos só o gate do WP write),
// mas são instanciados no construtor — basta stubá-los pra `new` não estourar.
vi.mock('./providers/lovable.js', () => ({ LovableProvider: class {} }));
vi.mock('./providers/openai.js', () => ({ OpenAIProvider: class {} }));
vi.mock('./providers/gemini.js', () => ({ GeminiProvider: class {} }));

import { AIProcessor } from './ai-processor.js';

describe('AIProcessor — gate WP write por BOTIFY_FLOW_SOURCE (G7)', () => {
  let processor: AIProcessor;
  const request = {
    flowId: 'f1',
    nodeId: 'n1',
    conversationId: 'c1',
    userMessage: 'oi',
    conversationHistory: [],
    variables: {},
    config: {
      provider: 'openai' as const,
      model: 'gpt-4o-mini',
      systemPrompt: 'sys',
      userPromptTemplate: '{user_message}',
      temperature: 0.7,
      maxTokens: 1000,
    },
  };
  const result = {
    response: 'resposta',
    tokensUsed: 42,
    provider: 'openai',
    model: 'gpt-4o-mini',
  };

  beforeEach(() => {
    processor = new AIProcessor();
    logAIProcessing.mockClear();
    logger.info.mockClear();
  });

  afterEach(() => {
    cfg.BOTIFY_FLOW_SOURCE = 'wordpress';
  });

  it('mode=omniconnect ⇒ WP write é skipped; só structured log local', async () => {
    cfg.BOTIFY_FLOW_SOURCE = 'omniconnect';
    await (processor as unknown as {
      logToWordPress: (req: unknown, res: unknown) => Promise<void>;
    }).logToWordPress(request, result);
    expect(logAIProcessing).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toMatch(/BOTIFY_FLOW_SOURCE=omniconnect/);
  });

  it('mode=wordpress ⇒ WP write acontece (back-compat)', async () => {
    cfg.BOTIFY_FLOW_SOURCE = 'wordpress';
    await (processor as unknown as {
      logToWordPress: (req: unknown, res: unknown) => Promise<void>;
    }).logToWordPress(request, result);
    expect(logAIProcessing).toHaveBeenCalledTimes(1);
    expect(logAIProcessing).toHaveBeenCalledWith({
      flowId: 'f1',
      nodeId: 'n1',
      conversationId: 'c1',
      userMessage: 'oi',
      aiResponse: 'resposta',
      provider: 'openai',
      model: 'gpt-4o-mini',
      tokensUsed: 42,
    });
  });

  it('mode=dual ⇒ WP write também acontece (até a janela de cutover fechar)', async () => {
    cfg.BOTIFY_FLOW_SOURCE = 'dual';
    await (processor as unknown as {
      logToWordPress: (req: unknown, res: unknown) => Promise<void>;
    }).logToWordPress(request, result);
    expect(logAIProcessing).toHaveBeenCalledTimes(1);
  });
});
