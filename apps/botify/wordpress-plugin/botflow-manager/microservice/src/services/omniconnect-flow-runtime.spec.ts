import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Spec do contrato G4 (ADR-0002): `resolveFlowConfigForEngine` decide
 * de onde ler o grafo do fluxo conforme `BOTIFY_FLOW_SOURCE`.
 * Sempre que esse arquivo for tocado, a tabela abaixo precisa continuar
 * batendo — é o que destrava o cutover WP → Omni.
 *
 *   wordpress  → só WP                              (default)
 *   omniconnect → só Omni (`/botify/internal/flows/:id/runtime-config`)
 *   dual       → Omni primeiro; se vazio/ausente, WP + warn de telemetria
 */

const { cfg, logger } = vi.hoisted(() => ({
  cfg: {
    BOTIFY_FLOW_SOURCE: 'wordpress' as 'wordpress' | 'omniconnect' | 'dual',
    OMNICONNECT_BACKEND_URL: 'https://omni.example.com',
    BOTIFY_INTERNAL_SYNC_SECRET: 'shared-secret',
    OMNICONNECT_BOTIFY_TENANT_ID: 'tenant-a',
  },
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../config.js', () => ({ config: cfg }));
vi.mock('../utils/logger.js', () => ({ logger }));

import { resolveFlowConfigForEngine } from './omniconnect-flow-runtime.js';

describe('resolveFlowConfigForEngine (BOTIFY_FLOW_SOURCE)', () => {
  const wpFlow = { nodes: [{ id: 'wp-start', type: 'start' }] };
  const omniFlow = { nodes: [{ id: 'omni-start', type: 'start' }] };
  let wpGetFlow: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    wpGetFlow = vi.fn(async () => wpFlow);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    logger.warn.mockReset();
    logger.error.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('mode=wordpress', () => {
    beforeEach(() => {
      cfg.BOTIFY_FLOW_SOURCE = 'wordpress';
    });

    it('lê só do WP; não chama Omni', async () => {
      const res = await resolveFlowConfigForEngine('f1', wpGetFlow);
      expect(res).toEqual(wpFlow);
      expect(wpGetFlow).toHaveBeenCalledWith('f1');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('retorna null se WP devolver shape inválido', async () => {
      wpGetFlow.mockResolvedValueOnce({ nodes: 'oops' });
      const res = await resolveFlowConfigForEngine('f1', wpGetFlow);
      expect(res).toBeNull();
    });
  });

  describe('mode=omniconnect', () => {
    beforeEach(() => {
      cfg.BOTIFY_FLOW_SOURCE = 'omniconnect';
    });

    it('chama o endpoint interno com Bearer + tenant header e devolve nodes', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => omniFlow,
      } as Response);
      const res = await resolveFlowConfigForEngine('f1', wpGetFlow);
      expect(res).toEqual({ nodes: omniFlow.nodes });
      expect(wpGetFlow).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://omni.example.com/botify/internal/flows/f1/runtime-config',
      );
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer shared-secret');
      expect(headers['X-Omni-Tenant-Id']).toBe('tenant-a');
    });

    it('retorna null em 404 sem cair pra WP', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);
      const res = await resolveFlowConfigForEngine('f1', wpGetFlow);
      expect(res).toBeNull();
      expect(wpGetFlow).not.toHaveBeenCalled();
    });
  });

  describe('mode=dual', () => {
    beforeEach(() => {
      cfg.BOTIFY_FLOW_SOURCE = 'dual';
    });

    it('Omni respondendo OK ⇒ usa Omni; WP nem é tocado', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => omniFlow,
      } as Response);
      const res = await resolveFlowConfigForEngine('f1', wpGetFlow);
      expect(res).toEqual({ nodes: omniFlow.nodes });
      expect(wpGetFlow).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('Omni 404 ⇒ fallback pra WP e warn de telemetria', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);
      const res = await resolveFlowConfigForEngine('f1', wpGetFlow);
      expect(res).toEqual(wpFlow);
      expect(wpGetFlow).toHaveBeenCalledWith('f1');
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn.mock.calls[0][0]).toMatch(/dual.*fallback para WordPress/);
    });

    it('Omni com nodes vazio ⇒ fallback pra WP', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ nodes: [] }),
      } as Response);
      const res = await resolveFlowConfigForEngine('f1', wpGetFlow);
      expect(res).toEqual(wpFlow);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('Omni network error ⇒ fallback pra WP', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await resolveFlowConfigForEngine('f1', wpGetFlow);
      expect(res).toEqual(wpFlow);
      // O error é logado dentro de fetchOmniconnectRuntimeFlowConfig e
      // o warn de fallback é emitido no caminho dual.
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('Ambos vazios ⇒ null', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);
      wpGetFlow.mockResolvedValueOnce(null);
      const res = await resolveFlowConfigForEngine('f1', wpGetFlow);
      expect(res).toBeNull();
    });
  });
});
