import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function makeContext(user: any, requiredRoles?: Role[]): { ctx: ExecutionContext; reflector: Reflector } {
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => () => undefined,
    getClass: () => function FakeClass() {},
  } as unknown as ExecutionContext;
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return { ctx, reflector };
}

describe('RolesGuard', () => {
  it('allows when no @Roles metadata is set', () => {
    const { ctx, reflector } = makeContext({ role: 'admin' }, undefined);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('prefers tenantRole over global role (multi-tenant source of truth)', () => {
    // Global role would PASS, but tenantRole says viewer-only.
    const { ctx, reflector } = makeContext(
      { role: Role.admin, tenantRole: Role.operator },
      [Role.admin],
    );
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(false);
  });

  it('grants access when tenantRole matches the required role', () => {
    const { ctx, reflector } = makeContext(
      { role: Role.operator, tenantRole: Role.admin },
      [Role.admin],
    );
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('falls back to user.role when tenantRole is null/undefined', () => {
    const { ctx, reflector } = makeContext({ role: Role.admin }, [Role.admin]);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('denies when neither tenantRole nor role is present', () => {
    const { ctx, reflector } = makeContext({}, [Role.admin]);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(false);
  });
});
