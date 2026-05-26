import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '../prisma.service';
import {
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';

interface UserRow {
  id: number;
  email: string;
  role: string;
}

interface RefreshRow {
  id: string;
  tenantId: string;
  userId: number;
  tokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  successorId: string | null;
  createdAt: Date;
}

const sha256 = (s: string) =>
  createHash('sha256').update(s, 'utf8').digest('hex');

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let prisma: any;
  let systemEvents: jest.Mocked<SystemEventsService>;
  let jwt: { sign: jest.Mock };

  let userStore: Map<number, UserRow>;
  let refreshStore: Map<string, RefreshRow>;
  let nextRefreshSerial: number;

  const findByHash = (tokenHash: string) =>
    Array.from(refreshStore.values()).find((r) => r.tokenHash === tokenHash) ??
    null;

  beforeEach(async () => {
    userStore = new Map([
      [1, { id: 1, email: 'op@a.com', role: 'operator' }],
      [2, { id: 2, email: 'admin@a.com', role: 'admin' }],
    ]);
    refreshStore = new Map();
    nextRefreshSerial = 1;

    prisma = {
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
        callback(prisma),
      ),
      userTenant: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.userId_tenantId?.tenantId === 'tenant-a') {
            return { role: 'broker' };
          }
          return null;
        }),
      },
      refreshToken: {
        create: jest.fn(async ({ data }: any) => {
          const row: RefreshRow = {
            id: `rt-${nextRefreshSerial++}`,
            tenantId: data.tenantId,
            userId: data.userId,
            tokenHash: data.tokenHash,
            userAgent: data.userAgent ?? null,
            ipAddress: data.ipAddress ?? null,
            expiresAt: data.expiresAt,
            revokedAt: null,
            successorId: null,
            createdAt: new Date(),
          };
          refreshStore.set(row.id, row);
          return row;
        }),
        findUnique: jest.fn(async ({ where, include }: any) => {
          const found = findByHash(where.tokenHash);
          if (!found) return null;
          if (!include) return found;
          const out: any = { ...found };
          if (include.user) out.user = userStore.get(found.userId) ?? null;
          return out;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = refreshStore.get(where.id);
          if (!row) throw new Error('NOT_FOUND');
          if (data.revokedAt !== undefined) row.revokedAt = data.revokedAt;
          if (data.successorId !== undefined)
            row.successorId = data.successorId;
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const row of refreshStore.values()) {
            if (where.id && row.id !== where.id) continue;
            if (where.tokenHash && row.tokenHash !== where.tokenHash) continue;
            if (where.userId !== undefined && row.userId !== where.userId)
              continue;
            if (where.revokedAt === null && row.revokedAt !== null) continue;
            if (where.successorId === null && row.successorId !== null)
              continue;
            if (data.revokedAt !== undefined) row.revokedAt = data.revokedAt;
            if (data.successorId !== undefined)
              row.successorId = data.successorId;
            count++;
          }
          return { count };
        }),
      },
    };

    systemEvents = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SystemEventsService>;

    jwt = {
      sign: jest.fn().mockReturnValue('mock-jwt'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt as unknown as JwtService },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => {
              if (k === 'ACCESS_TOKEN_TTL_SECONDS') return '300';
              if (k === 'REFRESH_TOKEN_TTL_DAYS') return '2';
              if (k === 'REFRESH_COOKIE_NAME') return 'oc_refresh_test';
              return undefined;
            },
          },
        },
        { provide: SystemEventsService, useValue: systemEvents },
      ],
    }).compile();

    service = module.get(RefreshTokenService);
  });

  // ---------- issue ----------

  it('issue persists ONLY the SHA-256 hash, not the raw token', async () => {
    const result = await service.issue(userStore.get(1)!, 'tenant-a');
    expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    const row = Array.from(refreshStore.values())[0];
    expect(row.tokenHash).toBe(sha256(result.refreshToken));
    expect(row.tokenHash).not.toBe(result.refreshToken);
  });

  it('issue respects env TTLs (access 300s, refresh 2d)', async () => {
    const result = await service.issue(userStore.get(1)!, 'tenant-a');
    expect(result.accessExpiresIn).toBe(300);
    const ttlMs = result.refreshExpiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(2 * 24 * 60 * 60 * 1000 - 5000);
    expect(ttlMs).toBeLessThanOrEqual(2 * 24 * 60 * 60 * 1000 + 5000);
  });

  it('issue refuses empty tenantId', async () => {
    await expect(service.issue(userStore.get(1)!, '')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // ---------- rotate ----------

  it('rotate revokes old token, returns a new one and links successorId', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');
    const second = await service.rotate(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    const oldRow = findByHash(sha256(first.refreshToken));
    const newRow = findByHash(sha256(second.refreshToken));
    expect(oldRow?.revokedAt).not.toBeNull();
    expect(oldRow?.successorId).toBe(newRow?.id);
  });

  it('rotate preserves the effective role from the active tenant membership', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');
    await service.rotate(first.refreshToken);

    expect(jwt.sign).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', role: 'broker' }),
      expect.any(Object),
    );
  });

  it('rotate rejects when another request already consumed the presented token', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');
    prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotate refuses a session scoped to an inactive tenant', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');
    prisma.userTenant.findUnique.mockResolvedValueOnce({
      role: 'broker',
      tenant: { isActive: false },
    });

    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotate refuses a session after tenant membership is removed', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');
    prisma.userTenant.findUnique.mockResolvedValueOnce(null);

    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotateToTenant issues a new session only for the authenticated owner', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');
    const switched = await service.rotateToTenant(
      first.refreshToken,
      { ...userStore.get(1)!, role: 'digital' },
      'tenant-b',
    );

    expect(findByHash(sha256(switched.refreshToken))?.tenantId).toBe(
      'tenant-b',
    );
    expect(jwt.sign).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId: 'tenant-b', role: 'digital' }),
      expect.any(Object),
    );
  });

  it('rotateToTenant refuses a refresh token owned by another user', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');

    await expect(
      service.rotateToTenant(first.refreshToken, userStore.get(2)!, 'tenant-b'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(Array.from(refreshStore.values())).toHaveLength(1);
  });

  it('rotate detects reuse and revokes the WHOLE chain of that user', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');
    const second = await service.rotate(first.refreshToken);
    // session paralela legítima
    const independent = await service.issue(userStore.get(1)!, 'tenant-a');

    // atacante apresenta o primeiro token de novo
    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(findByHash(sha256(second.refreshToken))?.revokedAt).not.toBeNull();
    expect(
      findByHash(sha256(independent.refreshToken))?.revokedAt,
    ).not.toBeNull();
    expect(systemEvents.logEvent).toHaveBeenCalledWith(
      EventType.AUTH_REFRESH_REUSE_DETECTED,
      expect.any(String),
      expect.objectContaining({ tokenId: expect.any(String) }),
      1,
      expect.any(String),
      'tenant-a',
    );
  });

  it('rotate refuses expired token', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');
    const row = findByHash(sha256(first.refreshToken))!;
    row.expiresAt = new Date(Date.now() - 1000);

    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotate refuses unknown token', async () => {
    await expect(service.rotate('a'.repeat(64))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotate refuses null / short token', async () => {
    await expect(service.rotate(null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.rotate('short')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // ---------- revoke ----------

  it('revoke marks the matching row as revoked (idempotent)', async () => {
    const first = await service.issue(userStore.get(1)!, 'tenant-a');
    await service.revoke(first.refreshToken);
    expect(findByHash(sha256(first.refreshToken))?.revokedAt).not.toBeNull();
    await expect(service.revoke(first.refreshToken)).resolves.toBeUndefined();
  });

  it('revokeAllForUser revokes only active rows of that user', async () => {
    await service.issue(userStore.get(1)!, 'tenant-a');
    await service.issue(userStore.get(1)!, 'tenant-a');
    await service.issue(userStore.get(2)!, 'tenant-a');
    const revoked = await service.revokeAllForUser(1);
    expect(revoked).toBe(2);
    const stillActive = Array.from(refreshStore.values()).filter(
      (r) => !r.revokedAt,
    );
    expect(stillActive.map((r) => r.userId)).toEqual([2]);
  });

  // ---------- cookie helpers ----------

  it('buildCookieOptions returns HttpOnly + sameSite=lax + scoped path', () => {
    const expiresAt = new Date('2030-01-01T00:00:00Z');
    const opts = service.buildCookieOptions(expiresAt);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/auth');
    expect(opts.expires).toBe(expiresAt);
    expect(opts).not.toHaveProperty('domain');
  });

  it('clears the same host-only auth cookie scope used when issuing', () => {
    const opts = service.buildClearCookieOptions();
    expect(opts).toEqual(
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/auth',
      }),
    );
    expect(opts).not.toHaveProperty('domain');
  });
});
