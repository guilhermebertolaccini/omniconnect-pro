/**
 * Flow graph navigation shared with FlowEngine (unit-tested).
 * Supports legacy `connections: string[]` and Botify editor format `{ target, sourceHandle? }`.
 */

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
