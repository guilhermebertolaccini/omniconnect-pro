/**
 * Contrato persistido do grafo de fluxos Botify (Fase G0 — ADR-0002).
 * Alinha o formato gravado pelo FlowEditor (`FlowEditor.tsx`) com o que o motor
 * (`flow-engine`) consome após `getFlowConfig`.
 *
 * Não depende de React Flow em runtime: apenas IDs, posição, `data` e ligações.
 */

/** Versão do envelope; omitida em grafos legados (compatível com v1). */
export const BOTIFY_FLOW_GRAPH_SCHEMA_VERSION = '1' as const;

export type BotifyFlowGraphSchemaVersion =
  | typeof BOTIFY_FLOW_GRAPH_SCHEMA_VERSION
  | string;

/** Tipos de nó suportados pelo editor; subset executado no microserviço varia por versão do motor. */
export type BotifyFlowNodeType =
  | 'start'
  | 'message'
  | 'media'
  | 'buttons'
  | 'list'
  | 'condition'
  | 'action'
  | 'delay'
  | 'ai';

/**
 * Ligação persistida: legado (`string` = id do nó destino) ou formato editor
 * (`target` + `sourceHandle` opcional para ramos yes/no da condição).
 */
export type BotifyFlowStoredConnection =
  | string
  | {
      target: string;
      sourceHandle?: string;
    };

/** Forma normalizada usada por `resolveNextNodeId` / motor. */
export interface BotifyFlowNormalizedConnection {
  target: string;
  sourceHandle?: string;
}

export interface BotifyFlowNode {
  id: string;
  type: BotifyFlowNodeType;
  position: { x: number; y: number };
  /** Payload do nó (texto, regex, delay, IA, handoff, etc.). */
  data: Record<string, unknown>;
  connections: BotifyFlowStoredConnection[];
}

/** Documento serializável do fluxo (corpo típico de API / coluna JSON). */
export interface BotifyFlowGraph {
  schemaVersion?: BotifyFlowGraphSchemaVersion;
  nodes: BotifyFlowNode[];
}

/** Config persistida por nó IA (endpoint separado no WP hoje; futuro Omni). */
export interface BotifyAiNodePersistedConfig {
  provider: string;
  model: string;
  systemPrompt?: string;
  userPromptTemplate?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Normaliza `connections` para o formato do motor.
 * Copiado conceitualmente de `flow-engine-navigation.ts` — fonte única aqui.
 */
export function normalizeBotifyFlowConnections(
  raw: unknown,
): BotifyFlowNormalizedConnection[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: BotifyFlowNormalizedConnection[] = [];
  for (const c of raw) {
    if (typeof c === 'string' && c.trim()) {
      out.push({ target: c.trim() });
      continue;
    }
    if (
      c &&
      typeof c === 'object' &&
      !Array.isArray(c) &&
      typeof (c as { target?: unknown }).target === 'string'
    ) {
      const t = ((c as { target: string }).target || '').trim();
      if (!t) continue;
      const sh = (c as { sourceHandle?: unknown }).sourceHandle;
      out.push({
        target: t,
        sourceHandle: typeof sh === 'string' && sh ? sh : undefined,
      });
    }
  }
  return out;
}
