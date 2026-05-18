/**
 * Helpers de role para o domínio CRM. A role efetiva é a do tenant atual
 * (UserTenant.role); se não houver UserTenant (cenários legacy), cai no
 * User.role global. Importante: nunca confiar somente em `user.role` ao
 * tomar decisão dentro de um tenant — vide JwtStrategy.
 */
import { Role } from '@prisma/client';
import type { RequestUserLike } from '../../common/utils/tenant-context';

export interface CrmActor {
  id: number;
  role: Role | null;
  tenantRole: Role | null;
}

/** Extrai actor (id + role efetiva) de um req.user já validado pelo JWT. */
export function crmActor(user: RequestUserLike & {
  id?: number | string;
  role?: string;
  tenantRole?: string | null;
}): CrmActor {
  const id = typeof user.id === 'number' ? user.id : Number(user.id);
  if (!Number.isFinite(id)) {
    throw new Error('Invalid user.id in JWT payload');
  }
  return {
    id,
    role: (user.role as Role | undefined) ?? null,
    tenantRole: (user.tenantRole as Role | null | undefined) ?? null,
  };
}

/** Retorna a role aplicada ao tenant atual (UserTenant.role) ou o fallback global. */
export function effectiveRole(actor: CrmActor): Role | null {
  return actor.tenantRole ?? actor.role;
}

export function isBrokerOnly(actor: CrmActor): boolean {
  return effectiveRole(actor) === Role.broker;
}
