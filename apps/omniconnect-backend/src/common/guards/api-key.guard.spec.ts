import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { TenantApiKeysService } from '../../tenant-api-keys/tenant-api-keys.service';

function makeContext(headers: Record<string, string> = {}): { ctx: ExecutionContext; req: any } {
  const req: any = { headers };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let resolveMock: jest.Mock;
  const ORIGINAL_ENV = process.env.NODE_ENV;

  beforeEach(async () => {
    resolveMock = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'API_KEY' ? 'legacy-key' : undefined) } },
        { provide: TenantApiKeysService, useValue: { resolve: resolveMock } },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('rejects requests with no Authorization header', async () => {
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects requests with empty token', async () => {
    const { ctx } = makeContext({ authorization: 'Bearer  ' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches resolved tenantId from TenantApiKey lookup', async () => {
    resolveMock.mockResolvedValue({ id: 'k1', tenantId: 't1', label: 'CI', prefix: 'oc_abc' });
    const { ctx, req } = makeContext({ authorization: 'Bearer oc_valid' });

    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(req.tenantId).toBe('t1');
    expect(req.apiKey).toEqual({ id: 'k1', label: 'CI', prefix: 'oc_abc' });
  });

  it('falls back to env API_KEY with default-tenant when NODE_ENV != production', async () => {
    process.env.NODE_ENV = 'development';
    resolveMock.mockResolvedValue(null);
    const { ctx, req } = makeContext({ authorization: 'Bearer legacy-key' });

    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(req.tenantId).toBe('default-tenant');
    expect(req.apiKey?.id).toBe('legacy-env');
  });

  it('refuses the legacy env key in production', async () => {
    process.env.NODE_ENV = 'production';
    resolveMock.mockResolvedValue(null);
    const { ctx } = makeContext({ authorization: 'Bearer legacy-key' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses unknown tokens in any environment', async () => {
    process.env.NODE_ENV = 'development';
    resolveMock.mockResolvedValue(null);
    const { ctx } = makeContext({ authorization: 'Bearer totally-unknown' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
