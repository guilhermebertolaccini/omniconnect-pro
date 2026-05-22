import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Bot, ConversationFlow } from '@/types/bot';

/**
 * Spec do contrato G5 (ADR-0002): `botifyDomainApi` decide a fonte do
 * data plane via `VITE_BOTIFY_DATA_SOURCE` (`wordpress` | `omniconnect`
 * | `dual`). O default agora é `omniconnect` — Vite Botify cutover do
 * WP fechado.
 *
 * Espelha o spec G4 do microserviço: cobre `getBots` e `setFlowActive`
 * como representativos. Cada vez que esse arquivo for tocado, a tabela
 * abaixo precisa continuar batendo.
 */

const { wpStub, omniStub } = vi.hoisted(() => ({
  wpStub: {
    getBots: vi.fn(),
    getBot: vi.fn(),
    createBot: vi.fn(),
    updateBot: vi.fn(),
    deleteBot: vi.fn(),
    getFlows: vi.fn(),
    getFlow: vi.fn(),
    createFlow: vi.fn(),
    updateFlow: vi.fn(),
    deleteFlow: vi.fn(),
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    getWhatsAppConfig: vi.fn(),
    updateWhatsAppConfig: vi.fn(),
    saveAIConfig: vi.fn(),
  },
  omniStub: {
    getBots: vi.fn(),
    getBot: vi.fn(),
    createBot: vi.fn(),
    updateBot: vi.fn(),
    deleteBot: vi.fn(),
    getFlows: vi.fn(),
    getFlow: vi.fn(),
    createFlow: vi.fn(),
    updateFlow: vi.fn(),
    deleteFlow: vi.fn(),
    publishFlow: vi.fn(),
    unpublishFlow: vi.fn(),
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    getWhatsAppConfig: vi.fn(),
    updateWhatsAppConfig: vi.fn(),
  },
}));

vi.mock('./wordpress-api', () => ({ wpApi: wpStub }));
vi.mock('./omniconnect-botify-api', () => ({ omniconnectBotifyApi: omniStub }));

import { botifyDomainApi } from './botify-domain-api';

function setSource(v: 'wordpress' | 'omniconnect' | 'dual' | undefined) {
  if (v === undefined) {
    vi.stubEnv('VITE_BOTIFY_DATA_SOURCE', '');
  } else {
    vi.stubEnv('VITE_BOTIFY_DATA_SOURCE', v);
  }
}

const botWp = { id: 'bot-wp', name: 'WP' } as unknown as Bot;
const botOmni = { id: 'bot-omni', name: 'Omni' } as unknown as Bot;
const flowWp = { id: 'flow-wp', isActive: true } as unknown as ConversationFlow;
const flowOmni = { id: 'flow-omni', isActive: true } as unknown as ConversationFlow;

beforeEach(() => {
  Object.values(wpStub).forEach((fn) => fn.mockReset());
  Object.values(omniStub).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('botifyDomainApi.source() default', () => {
  it('default (env ausente) ⇒ omniconnect — G5 fechou cutover WP', () => {
    setSource(undefined);
    expect(botifyDomainApi.source()).toBe('omniconnect');
  });

  it('valor inválido cai pro default omniconnect', () => {
    setSource('lixo' as 'wordpress');
    expect(botifyDomainApi.source()).toBe('omniconnect');
  });

  it('respeita override explícito', () => {
    setSource('wordpress');
    expect(botifyDomainApi.source()).toBe('wordpress');
    setSource('dual');
    expect(botifyDomainApi.source()).toBe('dual');
  });
});

describe('botifyDomainApi.getBots (3 modes)', () => {
  it('mode=wordpress lê só do WP', async () => {
    setSource('wordpress');
    wpStub.getBots.mockResolvedValueOnce([botWp]);
    const res = await botifyDomainApi.getBots();
    expect(res).toEqual([botWp]);
    expect(wpStub.getBots).toHaveBeenCalledTimes(1);
    expect(omniStub.getBots).not.toHaveBeenCalled();
  });

  it('mode=omniconnect lê só do Omni', async () => {
    setSource('omniconnect');
    omniStub.getBots.mockResolvedValueOnce([botOmni]);
    const res = await botifyDomainApi.getBots();
    expect(res).toEqual([botOmni]);
    expect(omniStub.getBots).toHaveBeenCalledTimes(1);
    expect(wpStub.getBots).not.toHaveBeenCalled();
  });

  it('mode=dual: Omni OK ⇒ usa Omni; WP nem é tocado', async () => {
    setSource('dual');
    omniStub.getBots.mockResolvedValueOnce([botOmni]);
    const res = await botifyDomainApi.getBots();
    expect(res).toEqual([botOmni]);
    expect(wpStub.getBots).not.toHaveBeenCalled();
  });

  it('mode=dual: Omni reject ⇒ fallback pra WP', async () => {
    setSource('dual');
    omniStub.getBots.mockRejectedValueOnce(new Error('502'));
    wpStub.getBots.mockResolvedValueOnce([botWp]);
    const res = await botifyDomainApi.getBots();
    expect(res).toEqual([botWp]);
    expect(omniStub.getBots).toHaveBeenCalledTimes(1);
    expect(wpStub.getBots).toHaveBeenCalledTimes(1);
  });
});

describe('botifyDomainApi.setFlowActive — semântica diferente por fonte', () => {
  it('mode=wordpress chama updateFlow({isActive}) — sem publish/unpublish', async () => {
    setSource('wordpress');
    wpStub.updateFlow.mockResolvedValueOnce(flowWp);
    const res = await botifyDomainApi.setFlowActive('f1', true);
    expect(res).toEqual(flowWp);
    expect(wpStub.updateFlow).toHaveBeenCalledWith('f1', { isActive: true });
    expect(omniStub.publishFlow).not.toHaveBeenCalled();
  });

  it('mode=omniconnect: active=true ⇒ publishFlow', async () => {
    setSource('omniconnect');
    omniStub.publishFlow.mockResolvedValueOnce(flowOmni);
    const res = await botifyDomainApi.setFlowActive('f1', true);
    expect(res).toEqual(flowOmni);
    expect(omniStub.publishFlow).toHaveBeenCalledWith('f1');
    expect(omniStub.unpublishFlow).not.toHaveBeenCalled();
  });

  it('mode=omniconnect: active=false ⇒ unpublishFlow', async () => {
    setSource('omniconnect');
    omniStub.unpublishFlow.mockResolvedValueOnce(flowOmni);
    const res = await botifyDomainApi.setFlowActive('f1', false);
    expect(res).toEqual(flowOmni);
    expect(omniStub.unpublishFlow).toHaveBeenCalledWith('f1');
  });

  it('mode=dual: Omni publish reject ⇒ fallback WP updateFlow', async () => {
    setSource('dual');
    omniStub.publishFlow.mockRejectedValueOnce(new Error('500'));
    wpStub.updateFlow.mockResolvedValueOnce(flowWp);
    const res = await botifyDomainApi.setFlowActive('f1', true);
    expect(res).toEqual(flowWp);
    expect(wpStub.updateFlow).toHaveBeenCalledWith('f1', { isActive: true });
  });
});

describe('botifyDomainApi.saveAIConfig — Omni grava no graph, não no /ai-config', () => {
  it('mode=omniconnect ⇒ ECO sem HTTP (config já viaja no node.data)', async () => {
    setSource('omniconnect');
    const res = await botifyDomainApi.saveAIConfig('42', 'node-a', {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'Você é um SDR.',
    });
    expect(wpStub.saveAIConfig).not.toHaveBeenCalled();
    expect(res.flowId).toBe(42);
    expect(res.nodeId).toBe('node-a');
    expect(res.provider).toBe('openai');
    expect(res.model).toBe('gpt-4o-mini');
  });

  it('mode=wordpress ⇒ delega ao wpApi.saveAIConfig', async () => {
    setSource('wordpress');
    wpStub.saveAIConfig.mockResolvedValueOnce({
      id: 1,
      flowId: 42,
      nodeId: 'node-a',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
      userPromptTemplate: '',
      temperature: 0.7,
      maxTokens: 1000,
      createdAt: 't',
      updatedAt: 't',
    });
    const res = await botifyDomainApi.saveAIConfig('42', 'node-a', {
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(wpStub.saveAIConfig).toHaveBeenCalledWith('42', 'node-a', {
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(res.id).toBe(1);
  });
});
