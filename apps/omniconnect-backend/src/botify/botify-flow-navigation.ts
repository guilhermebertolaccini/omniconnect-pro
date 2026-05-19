import {
  normalizeBotifyFlowConnections,
  type BotifyFlowNormalizedConnection,
} from '@omniconnect/shared-types';

export type NormalizedConnection = BotifyFlowNormalizedConnection;

export function normalizeConnections(raw: unknown): NormalizedConnection[] {
  return normalizeBotifyFlowConnections(raw);
}

/**
 * Next node id after executing `node` (branching only for `condition` via yes/no handles).
 * Portado do microserviço Botify (`flow-engine-navigation.ts`).
 */
export function resolveNextNodeId(
  node: { type?: string; data?: { condition?: string }; connections?: unknown },
  context: { text?: string },
): string | null {
  const conns = normalizeConnections(node?.connections);
  if (conns.length === 0) {
    return null;
  }

  if (node.type === 'condition') {
    const pattern = String(node.data?.condition ?? '').trim();
    let matched = false;
    try {
      if (pattern) {
        matched = new RegExp(pattern, 'i').test(String(context.text ?? ''));
      }
    } catch {
      matched = false;
    }
    const want = matched ? 'yes' : 'no';
    const labeled = conns.find((c) => c.sourceHandle === want);
    if (labeled) {
      return labeled.target;
    }
    const legacy = conns.find((c) => !c.sourceHandle);
    return legacy?.target ?? conns[0]?.target ?? null;
  }

  return conns[0]?.target ?? null;
}

export function findFlowEntryNode(nodes: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (!nodes.length) {
    return null;
  }
  const start = nodes.find((n) => n.type === 'start');
  if (start && Array.isArray(start.connections) && start.connections.length > 0) {
    const first = start.connections[0];
    const targetId =
      typeof first === 'string'
        ? first
        : first &&
            typeof first === 'object' &&
            typeof (first as { target?: unknown }).target === 'string'
          ? String((first as { target: string }).target)
          : '';
    if (targetId) {
      const next = nodes.find((n) => n.id === targetId);
      if (next) {
        return next;
      }
    }
  }

  const targetIds = new Set<string>();
  for (const n of nodes) {
    if (!Array.isArray(n.connections)) continue;
    for (const c of n.connections) {
      const tid =
        typeof c === 'string'
          ? c
          : c && typeof c === 'object' && typeof (c as { target?: unknown }).target === 'string'
            ? String((c as { target: string }).target)
            : '';
      if (tid) {
        targetIds.add(tid);
      }
    }
  }

  for (const node of nodes) {
    const id = typeof node.id === 'string' ? node.id : '';
    if (id && !targetIds.has(id)) {
      return node;
    }
  }

  return nodes[0] ?? null;
}
