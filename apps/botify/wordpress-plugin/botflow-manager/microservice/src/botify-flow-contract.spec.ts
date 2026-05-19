import { describe, it, expect } from 'vitest';
import {
  BOTIFY_FLOW_SCHEMA_VERSION,
  canonicalDefinitionToLegacyGraph,
  legacyFlowGraphToDefinition,
} from '@omniconnect/shared-types';

describe('botify-flow G0 contract (shared-types)', () => {
  it('round-trips legacy editor graph with condition yes/no handles', () => {
    const legacy = {
      schemaVersion: '1',
      nodes: [
        {
          id: 'start-1',
          type: 'start' as const,
          position: { x: 0, y: 0 },
          data: { triggerKeyword: 'oi' },
          connections: ['cond-1'],
        },
        {
          id: 'cond-1',
          type: 'condition' as const,
          position: { x: 1, y: 1 },
          data: { condition: 'sim|ok' },
          connections: [
            { target: 'msg-yes', sourceHandle: 'yes' },
            { target: 'msg-no', sourceHandle: 'no' },
          ],
        },
        {
          id: 'msg-yes',
          type: 'message' as const,
          position: { x: 2, y: 0 },
          data: { content: 'Yes branch' },
          connections: [],
        },
        {
          id: 'msg-no',
          type: 'message' as const,
          position: { x: 2, y: 2 },
          data: { content: 'No branch' },
          connections: [],
        },
      ],
    };

    const canonical = legacyFlowGraphToDefinition(legacy);
    expect(canonical.schemaVersion).toBe(BOTIFY_FLOW_SCHEMA_VERSION);
    expect(canonical.nodes).toHaveLength(4);
    expect(canonical.edges).toHaveLength(3);

    const roundTrip = canonicalDefinitionToLegacyGraph(canonical);
    expect(roundTrip.nodes.find((n) => n.id === 'cond-1')?.connections).toEqual(
      legacy.nodes[1].connections,
    );
  });
});
