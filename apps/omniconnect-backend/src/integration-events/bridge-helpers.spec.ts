import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  assertActiveConnection,
  deriveIdempotencyKey,
  safeParseJson,
  verifyHmac,
} from './bridge-helpers';

const ORIGINAL_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('verifyHmac', () => {
  const secret = 'test-secret-1234567890';
  const body = Buffer.from('{"hello":"world"}');

  const sign = (buf: Buffer, key = secret) =>
    crypto.createHmac('sha256', key).update(buf).digest('hex');

  it('accepts a matching signature in constant time', () => {
    expect(() => verifyHmac(body, sign(body), secret)).not.toThrow();
  });

  it('rejects a signature with mismatching length', () => {
    expect(() => verifyHmac(body, 'short', secret)).toThrow(UnauthorizedException);
  });

  it('rejects a forged signature of equal length', () => {
    const forged = '0'.repeat(64);
    expect(() => verifyHmac(body, forged, secret)).toThrow(UnauthorizedException);
  });

  it('rejects when the body was tampered with', () => {
    const expected = sign(body);
    const tampered = Buffer.from('{"hello":"WORLD"}');
    expect(() => verifyHmac(tampered, expected, secret)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the secret of another tenant is used', () => {
    const sigFromOtherTenant = sign(body, 'other-tenant-secret-9999');
    expect(() => verifyHmac(body, sigFromOtherTenant, secret)).toThrow(
      UnauthorizedException,
    );
  });
});

describe('assertActiveConnection', () => {
  const baseConn = {
    id: 'conn-1',
    provider: 'crm' as const,
    status: 'active',
    webhookSecretEncrypted: 'v1.aaaa.bbbb.cccc',
    tenantId: 'tenant-a',
    tenant: { id: 'tenant-a', isActive: true } as any,
  } as any;

  it('returns the connection when active and tenant is active', () => {
    expect(
      assertActiveConnection({
        connection: baseConn,
        provider: 'crm',
        integrationId: 'conn-1',
      }),
    ).toBe(baseConn);
  });

  it('returns null in development when connection is missing', () => {
    process.env.NODE_ENV = 'development';
    expect(
      assertActiveConnection({
        connection: null,
        provider: 'crm',
        integrationId: 'conn-x',
      }),
    ).toBeNull();
  });

  it('throws NotFoundException in production when connection is missing', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      assertActiveConnection({
        connection: null,
        provider: 'crm',
        integrationId: 'conn-x',
      }),
    ).toThrow(NotFoundException);
  });

  it('refuses cross-provider use (bot integration on crm endpoint)', () => {
    process.env.NODE_ENV = 'production';
    const wrongProvider = { ...baseConn, provider: 'bot' };
    expect(() =>
      assertActiveConnection({
        connection: wrongProvider,
        provider: 'crm',
        integrationId: 'conn-1',
      }),
    ).toThrow(NotFoundException);
  });

  it('refuses inactive tenants', () => {
    process.env.NODE_ENV = 'production';
    const inactive = {
      ...baseConn,
      tenant: { ...baseConn.tenant, isActive: false },
    };
    expect(() =>
      assertActiveConnection({
        connection: inactive,
        provider: 'crm',
        integrationId: 'conn-1',
      }),
    ).toThrow(NotFoundException);
  });
});

describe('deriveIdempotencyKey', () => {
  const body = Buffer.from('{"x":1}');

  it('uses the supplied header when present', () => {
    expect(deriveIdempotencyKey(body, 'client-key-1')).toBe('client-key-1');
  });

  it('hashes the body deterministically when no header is provided', () => {
    const a = deriveIdempotencyKey(body);
    const b = deriveIdempotencyKey(Buffer.from('{"x":1}'));
    expect(a).toBe(b);
    expect(a).not.toBe(deriveIdempotencyKey(Buffer.from('{"x":2}')));
  });
});

describe('safeParseJson', () => {
  it('parses valid JSON', () => {
    expect(safeParseJson(Buffer.from('{"a":1}'))).toEqual({ a: 1 });
  });

  it('falls back to a raw escape hatch on invalid JSON', () => {
    const parsed = safeParseJson(Buffer.from('not json')) as any;
    expect(parsed._raw).toContain('not json');
  });
});
