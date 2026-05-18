import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // Source of truth in multi-tenant context: UserTenant.role (exposed
    // by JwtStrategy as `user.tenantRole`). Fall back to the global
    // `user.role` only if no per-tenant role is present (legacy
    // tokens, dev-only paths without a UserTenant row, server-to-server
    // calls authenticated via ApiKeyGuard which does not set
    // tenantRole today).
    const effectiveRole: Role | undefined = user?.tenantRole ?? user?.role;
    if (!effectiveRole) return false;

    return requiredRoles.some((role) => effectiveRole === role);
  }
}
