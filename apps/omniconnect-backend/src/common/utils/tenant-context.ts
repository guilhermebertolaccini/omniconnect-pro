import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

/**
 * Canonical sentinel used by legacy seeds/migrations. Treated as a
 * developer placeholder — must never reach a handler in production.
 */
export const DEFAULT_TENANT_SENTINEL = 'default-tenant';

/**
 * Loose shape of the user object placed on `req.user` by JwtStrategy.
 * Keep this minimal — we only enforce what we actually rely on.
 */
export interface RequestUserLike {
  id?: number | string;
  tenantId?: string | null;
  role?: string;
}

/**
 * Pulls tenantId out of the authenticated user and refuses to proceed
 * when context is missing or set to the dev sentinel in production.
 *
 * Use this in controllers anywhere you previously wrote `user.tenantId`.
 *
 * @throws UnauthorizedException when no user is attached at all
 * @throws ForbiddenException when tenantId is missing/invalid (prod)
 */
export function ensureTenant(user: RequestUserLike | undefined | null): string {
  if (!user) {
    throw new UnauthorizedException('Authenticated user context missing');
  }
  const tenantId = user.tenantId?.trim();
  if (!tenantId) {
    throw new ForbiddenException('Tenant context missing for current user');
  }
  if (process.env.NODE_ENV === 'production' && tenantId === DEFAULT_TENANT_SENTINEL) {
    throw new ForbiddenException('default-tenant is not allowed in production');
  }
  return tenantId;
}

/**
 * Merge tenant scoping into any Prisma `where` clause. Pure helper —
 * useful where the call site cannot easily destructure tenantId in
 * the literal (e.g. dynamic filter builders).
 *
 * Usage:
 *   const where = withTenant(tenantId, baseFilter);
 *   return this.prisma.thing.findMany({ where });
 */
export function withTenant<T extends Record<string, unknown>>(
  tenantId: string,
  where: T = {} as T,
): T & { tenantId: string } {
  if (!tenantId) {
    throw new ForbiddenException('tenantId is required for tenant-scoped queries');
  }
  return { ...where, tenantId };
}

/**
 * Defensive guard for background jobs / processors that receive
 * tenantId via payload. Same semantics as ensureTenant but the source
 * is a JSON job object instead of req.user.
 *
 * @param payload The job data object — must carry `tenantId`.
 * @param context Optional label (e.g. `"campaigns:42"`) included in the
 *                error message to ease debugging of queue payloads.
 */
export function ensureJobTenant(
  payload: { tenantId?: string | null } | null | undefined,
  context?: string,
): string {
  const where = context ? ` (${context})` : '';
  if (!payload) {
    throw new ForbiddenException(`Job payload missing tenant context${where}`);
  }
  const tenantId = payload.tenantId?.trim();
  if (!tenantId) {
    throw new ForbiddenException(`Job payload missing tenantId${where}`);
  }
  if (process.env.NODE_ENV === 'production' && tenantId === DEFAULT_TENANT_SENTINEL) {
    throw new ForbiddenException(`default-tenant is not allowed in production jobs${where}`);
  }
  return tenantId;
}
