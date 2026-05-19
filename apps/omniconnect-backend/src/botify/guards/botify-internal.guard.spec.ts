import {
  BadRequestException,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { BotifyInternalGuard } from './botify-internal.guard';

function mockExecutionContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as ExecutionContext;
}

describe('BotifyInternalGuard', () => {
  const guard = new BotifyInternalGuard();
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.BOTIFY_INTERNAL_SYNC_SECRET;
    process.env.BOTIFY_INTERNAL_SYNC_SECRET = 'test-internal-sync-secret-at-least-sixteen-bytes-long';
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.BOTIFY_INTERNAL_SYNC_SECRET;
    else process.env.BOTIFY_INTERNAL_SYNC_SECRET = savedSecret;
  });

  it('rejects when BOTIFY_INTERNAL_SYNC_SECRET is not set', () => {
    delete process.env.BOTIFY_INTERNAL_SYNC_SECRET;
    const ctx = mockExecutionContext({
      authorization: 'Bearer x',
      'x-omni-tenant-id': 'default-tenant',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow(/BOTIFY_INTERNAL_SYNC_SECRET is not configured/);
  });

  it('rejects invalid Bearer token', () => {
    const ctx = mockExecutionContext({
      authorization: 'Bearer wrong',
      'x-omni-tenant-id': 'default-tenant',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow(/Invalid internal authorization/);
  });

  it('rejects malformed X-Omni-Tenant-Id', () => {
    const ctx = mockExecutionContext({
      authorization: `Bearer ${process.env.BOTIFY_INTERNAL_SYNC_SECRET}`,
      'x-omni-tenant-id': 'not a slug!',
    });
    expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
  });

  it('accepts slug tenant id default-tenant and attaches to request', () => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${process.env.BOTIFY_INTERNAL_SYNC_SECRET}`,
      'x-omni-tenant-id': 'default-tenant',
    };
    const req: { headers: typeof headers; botifyInternalTenantId?: string } = {
      headers,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.botifyInternalTenantId).toBe('default-tenant');
  });
});
