import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma.service';

describe('JwtStrategy.validate', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  const buildStrategy = (
    user: any,
    membership: { role: string } | null = { role: 'admin' },
  ) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      userTenant: { findUnique: jest.fn().mockResolvedValue(membership) },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    return new JwtStrategy(config, prisma);
  };

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('rejects when user does not exist', async () => {
    const strategy = buildStrategy(null);
    await expect(strategy.validate({ sub: 1 })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses missing tenantId in production', async () => {
    process.env.NODE_ENV = 'production';
    const strategy = buildStrategy({ id: 1, email: 'a@b.com', role: 'admin' });
    await expect(strategy.validate({ sub: 1 })).rejects.toThrow(
      /Tenant not explicitly defined/i,
    );
  });

  it('refuses default-tenant in production', async () => {
    process.env.NODE_ENV = 'production';
    const strategy = buildStrategy({ id: 1, email: 'a@b.com', role: 'admin' });
    await expect(
      strategy.validate({ sub: 1, tenantId: 'default-tenant' }),
    ).rejects.toThrow(/Tenant not explicitly defined/i);
  });

  it('allows default-tenant in development without checking membership', async () => {
    process.env.NODE_ENV = 'development';
    const strategy = buildStrategy({ id: 1, email: 'a@b.com', role: 'admin' });
    await expect(strategy.validate({ sub: 1 })).resolves.toMatchObject({
      tenantId: 'default-tenant',
      tenantRole: null,
    });
  });

  it('returns user with tenantId AND tenantRole from UserTenant in production', async () => {
    process.env.NODE_ENV = 'production';
    const strategy = buildStrategy(
      { id: 1, email: 'a@b.com', role: 'operator' },
      { role: 'admin' },
    );
    await expect(
      strategy.validate({ sub: 1, tenantId: 'tenant-a' }),
    ).resolves.toMatchObject({
      id: 1,
      tenantId: 'tenant-a',
      tenantRole: 'admin',
      role: 'operator',
    });
  });

  it('rejects in production when the user has no UserTenant row for the claimed tenant', async () => {
    process.env.NODE_ENV = 'production';
    const strategy = buildStrategy(
      { id: 1, email: 'a@b.com', role: 'admin' },
      null,
    );
    await expect(
      strategy.validate({ sub: 1, tenantId: 'tenant-foreign' }),
    ).rejects.toThrow(/not a member of the requested tenant/i);
  });

  it('allows missing membership in development (warning only)', async () => {
    process.env.NODE_ENV = 'development';
    const strategy = buildStrategy(
      { id: 1, email: 'a@b.com', role: 'admin' },
      null,
    );
    await expect(
      strategy.validate({ sub: 1, tenantId: 'tenant-a' }),
    ).resolves.toMatchObject({
      tenantId: 'tenant-a',
      tenantRole: null,
    });
  });
});
