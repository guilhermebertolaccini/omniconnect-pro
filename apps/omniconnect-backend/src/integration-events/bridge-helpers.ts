import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { IntegrationConnection, Tenant } from '@prisma/client';

export type ProviderId = 'crm' | 'ads' | 'bot';

export interface VerifyConnectionOpts {
  connection: (IntegrationConnection & { tenant: Tenant }) | null;
  provider: ProviderId;
  integrationId: string;
}

/**
 * Returns the verified active connection, or throws.
 * In NODE_ENV !== production with a missing/invalid connection, returns
 * null so callers can fall back to a dev tenant (caller's choice).
 */
export function assertActiveConnection(opts: VerifyConnectionOpts) {
  const { connection, provider, integrationId } = opts;
  if (
    !connection ||
    connection.provider !== provider ||
    connection.status !== 'active' ||
    !connection.tenant.isActive
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException(`Integration ${integrationId} not found or inactive`);
    }
    return null;
  }
  return connection;
}

/**
 * Constant-time HMAC verification over the raw body buffer. Provider
 * secret comes from IntegrationConnection.secretHash.
 *
 * The signature header is expected to be the hex digest of
 * HMAC-SHA256(secret, rawBody). If the provider uses a different
 * scheme (e.g. Meta uses "sha256=<hex>"), strip that prefix before
 * passing in.
 */
export function verifyHmac(rawBody: Buffer, signature: string, secret: string) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new UnauthorizedException('Invalid signature');
  }
}

/**
 * Derive an idempotency key from the header (when client supplies one)
 * or by hashing the raw body. We do NOT mix tenantId in because we
 * want to detect cross-tenant collisions explicitly in the service.
 */
export function deriveIdempotencyKey(rawBody: Buffer, header?: string | null) {
  const trimmed = header?.trim();
  if (trimmed) return trimmed;
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

/**
 * Parse a raw body buffer into JSON for Prisma storage. Falls back to
 * a tagged escape hatch so we never crash on malformed payloads — the
 * audit log still records what we received.
 */
export function safeParseJson(rawBody: Buffer): Prisma.InputJsonValue {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { _raw: rawBody.toString('utf8').slice(0, 65_536) };
  }
}
