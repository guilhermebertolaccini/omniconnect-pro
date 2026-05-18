// Persistent, reactive store for intent-score weights.
// Weights are normalized so they always sum to 1 when consumed.

import { useSyncExternalStore } from 'react';

export interface IntentWeights {
  ctr: number;
  conversionRate: number;
  thruPlayRate: number;
}

export const DEFAULT_WEIGHTS: IntentWeights = {
  ctr: 0.5,
  conversionRate: 0.3,
  thruPlayRate: 0.2,
};

const STORAGE_KEY = 'adpilot:intent-weights';

function load(): IntentWeights {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WEIGHTS;
    const parsed = JSON.parse(raw) as Partial<IntentWeights>;
    return {
      ctr: Number.isFinite(parsed.ctr) ? Number(parsed.ctr) : DEFAULT_WEIGHTS.ctr,
      conversionRate: Number.isFinite(parsed.conversionRate)
        ? Number(parsed.conversionRate)
        : DEFAULT_WEIGHTS.conversionRate,
      thruPlayRate: Number.isFinite(parsed.thruPlayRate)
        ? Number(parsed.thruPlayRate)
        : DEFAULT_WEIGHTS.thruPlayRate,
    };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

let current: IntentWeights = typeof window !== 'undefined' ? load() : DEFAULT_WEIGHTS;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getIntentWeights(): IntentWeights {
  return current;
}

export function setIntentWeights(next: IntentWeights) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore storage failures */
  }
  emit();
}

export function resetIntentWeights() {
  setIntentWeights(DEFAULT_WEIGHTS);
}

/** Returns weights normalized so they sum to 1. */
export function normalizeWeights(w: IntentWeights): IntentWeights {
  const sum = w.ctr + w.conversionRate + w.thruPlayRate;
  if (sum <= 0) return DEFAULT_WEIGHTS;
  return {
    ctr: w.ctr / sum,
    conversionRate: w.conversionRate / sum,
    thruPlayRate: w.thruPlayRate / sum,
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIntentWeights(): IntentWeights {
  return useSyncExternalStore(subscribe, getIntentWeights, () => DEFAULT_WEIGHTS);
}
