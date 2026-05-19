/**
 * Contrato congelado — Fase G0 (ADR-0002 Accepted).
 * Fonte canónica para bots/fluxos no OmniconnectPRO: JSON serializável + variantes legadas
 * (editor WordPress / React Flow com `connections[]` nos nós).
 *
 * Regras de produto:
 * - Nenhum `tenantId` confiável vem deste pacote em requests: o backend deriva do JWT/API key.
 * - Import WP → Omni deve ser idempotente (usar `externalSourceId` + chaves estáveis).
 *
 * Ordem de implementação: G0 (este ficheiro) → G1 Prisma (review multitenancy) → G2 CRUD → G3 motor.
 */

/** Versão semântica do documento de fluxo (bump ao mudar shape). */
export const BOTIFY_FLOW_SCHEMA_VERSION = '1' as const;

/** @deprecated Use BOTIFY_FLOW_SCHEMA_VERSION; mantido para compat com imports antigos. */
export const BOTIFY_FLOW_GRAPH_SCHEMA_VERSION = BOTIFY_FLOW_SCHEMA_VERSION;

export type BotifyFlowSchemaVersion = typeof BOTIFY_FLOW_SCHEMA_VERSION | string;

export type BotifyFlowGraphSchemaVersion = BotifyFlowSchemaVersion;

/** Fonte de verdade em runtime (feature flag ADR-0002). */
export type BotifyFlowRuntimeSource = 'wordpress' | 'omniconnect' | 'dual';

/** Tipos de nó do editor/motor atuais. */
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
 * Ligação no formato persistido pelo editor legado (WP): string ou objeto com ramos.
 */
export type BotifyFlowStoredConnection =
  | string
  | {
      target: string;
      sourceHandle?: string;
    };

/** Forma normalizada usada pelo motor (`resolveNextNodeId`). */
export interface BotifyFlowNormalizedConnection {
  target: string;
  sourceHandle?: string;
}

export interface BotifyPosition {
  x: number;
  y: number;
}

/* -------------------------------------------------------------------------- */
/* Bot + Flow (metadados — sem tenantId no contrato cliente)                  */
/* -------------------------------------------------------------------------- */

/**
 * Bot lógico Botify. O `tenantId` existe só em persistência backend (Prisma), nunca confiar
 * em valor vindo do browser ou do body JSON de import sem validação server-side.
 */
export interface BotifyBot {
  id: string;
  name: string;
  description?: string;
  /** Id estável no WordPress/legado — mapeamento import idempotente. */
  externalSourceId?: string;
  isActive?: boolean;
}

/**
 * Fluxo (metadado). A definição do grafo vive em `BotifyFlowDefinition` / `BotifyFlowGraph`.
 */
export interface BotifyFlow {
  id: string;
  botId: string;
  name: string;
  triggerKeyword?: string;
  /** Publicado no Omni (G2+). */
  isPublished?: boolean;
  externalSourceId?: string;
}

/* -------------------------------------------------------------------------- */
/* Nós — dados por tipo (hints de schema; runtime continua a aceitar Record) */
/* -------------------------------------------------------------------------- */

export interface BotifyStartNodeData {
  triggerKeyword?: string;
}

export interface BotifyMessageNodeData {
  content?: string;
}

export interface BotifyConditionNodeData {
  /** Regex ou lista pipe-separated (motor atual). */
  condition?: string;
}

/** actionType `transfer` mapeia para handoff Omni (`botify.handoff.created`). */
export interface BotifyActionNodeData {
  actionType?: string;
  message?: string;
  contactName?: string;
  segment?: number;
}

export interface BotifyDelayNodeData {
  delayMs?: number;
}

export interface BotifyHandoffPayloadHint extends BotifyActionNodeData {
  actionType: 'transfer';
}

export interface BotifyAiNodeData {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  userPromptTemplate?: string;
  temperature?: number;
  maxTokens?: number;
  label?: string;
}

/** Config IA persistida à parte no WP hoje; no Omni pode ser coluna JSON por nó. */
export interface BotifyAiNodePersistedConfig {
  provider: string;
  model: string;
  systemPrompt?: string;
  userPromptTemplate?: string;
  temperature?: number;
  maxTokens?: number;
}

/* -------------------------------------------------------------------------- */
/* Arestas + grafo canónico (Omni / API futura)                               */
/* -------------------------------------------------------------------------- */

export interface BotifyFlowEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** Nó sem `connections` — ligações só em `edges`. */
export interface BotifyFlowNodeCanonical {
  id: string;
  type: BotifyFlowNodeType;
  position: BotifyPosition;
  data: Record<string, unknown>;
}

/**
 * Definição canónica: nós + arestas explícitas (recomendado para Prisma JSON / API Nest).
 */
export interface BotifyFlowDefinition {
  schemaVersion: typeof BOTIFY_FLOW_SCHEMA_VERSION;
  nodes: BotifyFlowNodeCanonical[];
  edges: BotifyFlowEdge[];
}

/* -------------------------------------------------------------------------- */
/* Formato legado editor (connections por nó) — compat FlowEditor / microserviço */
/* -------------------------------------------------------------------------- */

export interface BotifyFlowNode {
  id: string;
  type: BotifyFlowNodeType;
  position: BotifyPosition;
  data: Record<string, unknown>;
  connections: BotifyFlowStoredConnection[];
}

/** Documento legado (WP export / save atual). */
export interface BotifyFlowGraph {
  schemaVersion?: BotifyFlowSchemaVersion;
  nodes: BotifyFlowNode[];
}

/* -------------------------------------------------------------------------- */
/* Funções puras (import idempotente, normalização)                           */
/* -------------------------------------------------------------------------- */

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

/** Deriva arestas explícitas a partir do formato editor com `connections[]`. */
export function legacyEditorConnectionsToEdges(nodes: BotifyFlowNode[]): BotifyFlowEdge[] {
  const edges: BotifyFlowEdge[] = [];
  for (const node of nodes) {
    const conns = normalizeBotifyFlowConnections(node.connections);
    conns.forEach((c, index) => {
      edges.push({
        id: `${node.id}-${c.target}-${c.sourceHandle ?? index}`,
        source: node.id,
        target: c.target,
        sourceHandle: c.sourceHandle ?? null,
      });
    });
  }
  return edges;
}

/** Converte documento legado para forma canónica (persistência Omni). */
export function legacyFlowGraphToDefinition(
  graph: BotifyFlowGraph,
): BotifyFlowDefinition {
  const nodes: BotifyFlowNodeCanonical[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }));
  return {
    nodes,
    edges: legacyEditorConnectionsToEdges(graph.nodes),
    schemaVersion: BOTIFY_FLOW_SCHEMA_VERSION,
  };
}

/** Reverte canónico → legado (ex.: export para microserviço que ainda espera connections). */
export function canonicalDefinitionToLegacyGraph(def: BotifyFlowDefinition): BotifyFlowGraph {
  const connectionMap = new Map<string, BotifyFlowStoredConnection[]>();
  for (const e of def.edges) {
    const list = connectionMap.get(e.source) ?? [];
    if (e.sourceHandle) {
      list.push({ target: e.target, sourceHandle: e.sourceHandle });
    } else {
      list.push(e.target);
    }
    connectionMap.set(e.source, list);
  }

  const nodes: BotifyFlowNode[] = def.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    connections: connectionMap.get(n.id) ?? [],
  }));

  return {
    schemaVersion: def.schemaVersion,
    nodes,
  };
}
