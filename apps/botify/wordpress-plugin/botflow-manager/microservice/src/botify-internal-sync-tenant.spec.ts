import { describe, it, expect } from 'vitest';
import {
  isValidBotifySyncTenantId,
  BOTIFY_SYNC_TENANT_ID_RE,
} from '@omniconnect/shared-types';

describe('Botify internal sync tenant header (phase 1)', () => {
  it('matches seed Tenant.id slug', () => {
    expect(isValidBotifySyncTenantId('default-tenant')).toBe(true);
  });

  it('matches typical UUID', () => {
    expect(isValidBotifySyncTenantId('550e8400-e29b-41d4-a716-446655440000')).toBe(
      true,
    );
  });

  it('rejects unsupported characters', () => {
    expect(isValidBotifySyncTenantId("'; DROP SCHEMA")).toBe(false);
    expect(BOTIFY_SYNC_TENANT_ID_RE.test('tenant with spaces')).toBe(false);
  });
});
