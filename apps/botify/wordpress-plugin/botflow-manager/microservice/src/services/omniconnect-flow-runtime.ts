/**
 * Cliente HTTP para `GET /botify/internal/flows/:id/runtime-config` no omniconnect-backend.
 * Usado quando BOTIFY_FLOW_SOURCE é omniconnect ou dual (fallback).
 */
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export type BotifyFlowRuntimeSource = 'wordpress' | 'omniconnect' | 'dual';

function trimSlash(s: string): string {
  return s.replace(/\/$/, '');
}

export async function fetchOmniconnectRuntimeFlowConfig(
  flowId: string,
): Promise<Record<string, unknown> | null> {
  const base = config.OMNICONNECT_BACKEND_URL
    ? trimSlash(config.OMNICONNECT_BACKEND_URL)
    : '';
  const secret = config.BOTIFY_INTERNAL_SYNC_SECRET?.trim();
  const tenantId = config.OMNICONNECT_BOTIFY_TENANT_ID?.trim();

  if (!base || !secret || !tenantId) {
    logger.warn(
      '[omniconnect] Flow runtime: missing OMNICONNECT_BACKEND_URL / BOTIFY_INTERNAL_SYNC_SECRET / OMNICONNECT_BOTIFY_TENANT_ID',
    );
    return null;
  }

  const url = `${base}/botify/internal/flows/${encodeURIComponent(flowId)}/runtime-config`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        'X-Omni-Tenant-Id': tenantId,
      },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      logger.error(
        `[omniconnect] Flow runtime HTTP ${res.status} for flow ${flowId}`,
      );
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    return data;
  } catch (e) {
    logger.error(`[omniconnect] Flow runtime fetch failed for ${flowId}:`, e);
    return null;
  }
}

export async function resolveFlowConfigForEngine(
  flowId: string,
  wpGetFlow: (id: string) => Promise<unknown>,
): Promise<{ nodes: unknown[] } | null> {
  const mode = config.BOTIFY_FLOW_SOURCE;

  if (mode === 'wordpress') {
    const flow = await wpGetFlow(flowId);
    return flow && typeof flow === 'object' && Array.isArray((flow as { nodes?: unknown }).nodes)
      ? (flow as { nodes: unknown[] })
      : null;
  }

  if (mode === 'omniconnect') {
    const omni = await fetchOmniconnectRuntimeFlowConfig(flowId);
    if (omni && Array.isArray(omni.nodes)) {
      return { nodes: omni.nodes as unknown[] };
    }
    return null;
  }

  // dual — Omni primeiro; se vazio/ausente, cai pra WP e loga (telemetria
  // do cutover; ADR-0002 G4 — frequência de fallback deve cair a zero
  // antes de virar `omniconnect`).
  const omniFirst = await fetchOmniconnectRuntimeFlowConfig(flowId);
  if (omniFirst && Array.isArray(omniFirst.nodes) && omniFirst.nodes.length > 0) {
    return { nodes: omniFirst.nodes as unknown[] };
  }
  logger.warn(
    `[BOTIFY_FLOW_SOURCE=dual] flow ${flowId} ausente/vazio em Omni; fallback para WordPress (ADR-0002 G4)`,
  );
  const wpFlow = await wpGetFlow(flowId);
  if (
    wpFlow &&
    typeof wpFlow === 'object' &&
    Array.isArray((wpFlow as { nodes?: unknown }).nodes)
  ) {
    return { nodes: (wpFlow as { nodes: unknown[] }).nodes };
  }
  return null;
}
