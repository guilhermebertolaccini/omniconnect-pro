import { describe, it, expect } from 'vitest';
import { normalizeConnections, resolveNextNodeId } from './flow-engine-navigation.js';

describe('flow-engine-navigation', () => {
  it('normalizes legacy string connections', () => {
    expect(normalizeConnections(['a', 'b'])).toEqual([
      { target: 'a' },
      { target: 'b' },
    ]);
  });

  it('normalizes Botify editor objects with sourceHandle', () => {
    expect(
      normalizeConnections([
        { target: 'yes-node', sourceHandle: 'yes' },
        { target: 'no-node', sourceHandle: 'no' },
      ]),
    ).toEqual([
      { target: 'yes-node', sourceHandle: 'yes' },
      { target: 'no-node', sourceHandle: 'no' },
    ]);
  });

  it('resolves condition yes branch when pattern matches message', () => {
    const next = resolveNextNodeId(
      {
        type: 'condition',
        data: { condition: 'comprar|venda' },
        connections: [
          { target: 't-yes', sourceHandle: 'yes' },
          { target: 't-no', sourceHandle: 'no' },
        ],
      },
      { text: 'Quero comprar apartamento' },
    );
    expect(next).toBe('t-yes');
  });

  it('resolves condition no branch when pattern does not match', () => {
    const next = resolveNextNodeId(
      {
        type: 'condition',
        data: { condition: 'sim|ok' },
        connections: [
          { target: 't-yes', sourceHandle: 'yes' },
          { target: 't-no', sourceHandle: 'no' },
        ],
      },
      { text: 'Talvez depois' },
    );
    expect(next).toBe('t-no');
  });

  it('falls back to first unlabeled edge for legacy condition saves', () => {
    const next = resolveNextNodeId(
      {
        type: 'condition',
        data: { condition: 'x' },
        connections: ['legacy-only'],
      },
      { text: 'x' },
    );
    expect(next).toBe('legacy-only');
  });
});
