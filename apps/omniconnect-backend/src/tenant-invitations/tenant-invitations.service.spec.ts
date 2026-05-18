import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { TenantInvitationsService } from './tenant-invitations.service';
import { PrismaService } from '../prisma.service';
import {
  SystemEventsService,
  EventType,
} from '../system-events/system-events.service';

interface UserRow {
  id: number;
  email: string;
  name: string;
  password: string;
  role: Role;
}

interface InvitationRow {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  token: string;
  invitedById: number | null;
  acceptedById: number | null;
  acceptedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

interface MembershipRow {
  userId: number;
  tenantId: string;
  role: Role;
}

interface TenantRow {
  id: string;
  name: string;
}

describe('TenantInvitationsService', () => {
  let service: TenantInvitationsService;
  let prisma: any;
  let systemEvents: jest.Mocked<SystemEventsService>;

  let userStore: Map<number, UserRow>;
  let invitationStore: Map<string, InvitationRow>;
  let membershipStore: Map<string, MembershipRow>;
  let tenantStore: Map<string, TenantRow>;
  let nextUserId: number;

  const membershipKey = (userId: number, tenantId: string) => `${userId}::${tenantId}`;

  const seedTenant = (id: string, name: string) => {
    tenantStore.set(id, { id, name });
  };

  const seedUser = async (over: Partial<UserRow> & { email: string; role: Role }) => {
    const row: UserRow = {
      id: over.id ?? nextUserId++,
      email: over.email.toLowerCase(),
      name: over.name ?? `User ${over.email}`,
      password: over.password ?? (await argon2.hash('correct-horse-battery')),
      role: over.role,
    };
    userStore.set(row.id, row);
    return row;
  };

  const seedMembership = (userId: number, tenantId: string, role: Role) => {
    membershipStore.set(membershipKey(userId, tenantId), { userId, tenantId, role });
  };

  beforeEach(async () => {
    userStore = new Map();
    invitationStore = new Map();
    membershipStore = new Map();
    tenantStore = new Map();
    nextUserId = 1;

    seedTenant('tenant-a', 'Tenant A');
    seedTenant('tenant-b', 'Tenant B');

    prisma = {
      user: {
        findUnique: jest.fn(async ({ where, select }: any) => {
          let found: UserRow | undefined;
          if (where.id !== undefined) found = userStore.get(where.id);
          else if (where.email !== undefined)
            found = Array.from(userStore.values()).find(
              (u) => u.email === where.email.toLowerCase(),
            );
          if (!found) return null;

          if (!select) return { ...found };

          const out: any = {};
          if (select.id) out.id = found.id;
          if (select.email) out.email = found.email;
          if (select.name) out.name = found.name;
          if (select.role) out.role = found.role;
          if (select.tenants) {
            const whereInner = select.tenants?.where ?? {};
            out.tenants = Array.from(membershipStore.values()).filter((m) => {
              if (m.userId !== found!.id) return false;
              if (whereInner.tenantId && m.tenantId !== whereInner.tenantId) return false;
              return true;
            });
          }
          return out;
        }),
        create: jest.fn(async ({ data }: any) => {
          const row: UserRow = {
            id: nextUserId++,
            email: data.email.toLowerCase(),
            name: data.name,
            password: data.password,
            role: data.role,
          };
          userStore.set(row.id, row);
          return { ...row };
        }),
      },
      userTenant: {
        findUnique: jest.fn(async ({ where }: any) => {
          const k = where.userId_tenantId;
          return membershipStore.get(membershipKey(k.userId, k.tenantId)) ?? null;
        }),
        create: jest.fn(async ({ data }: any) => {
          const k = membershipKey(data.userId, data.tenantId);
          if (membershipStore.has(k)) {
            throw new Error('UNIQUE_CONSTRAINT_VIOLATION');
          }
          const row = { userId: data.userId, tenantId: data.tenantId, role: data.role };
          membershipStore.set(k, row);
          return row;
        }),
      },
      tenantInvitation: {
        create: jest.fn(async ({ data }: any) => {
          const row: InvitationRow = {
            id: `inv-${invitationStore.size + 1}`,
            tenantId: data.tenantId,
            email: data.email.toLowerCase(),
            role: data.role,
            token: data.token,
            invitedById: data.invitedById ?? null,
            acceptedById: null,
            acceptedAt: null,
            expiresAt: data.expiresAt,
            createdAt: new Date(),
          };
          invitationStore.set(row.id, row);
          return row;
        }),
        findUnique: jest.fn(async ({ where, include }: any) => {
          const found = Array.from(invitationStore.values()).find(
            (i) => i.token === where.token,
          );
          if (!found) return null;
          if (!include) return found;
          const out: any = { ...found };
          if (include.tenant)
            out.tenant = tenantStore.get(found.tenantId)
              ? { name: tenantStore.get(found.tenantId)!.name }
              : null;
          if (include.invitedBy && found.invitedById) {
            const inviter = userStore.get(found.invitedById);
            out.invitedBy = inviter ? { name: inviter.name } : null;
          } else if (include.invitedBy) {
            out.invitedBy = null;
          }
          return out;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          return (
            Array.from(invitationStore.values())
              .filter((i) => {
                if (where.tenantId && i.tenantId !== where.tenantId) return false;
                if (where.email && i.email !== where.email.toLowerCase()) return false;
                if (
                  where.acceptedAt !== undefined &&
                  i.acceptedAt !== where.acceptedAt &&
                  where.acceptedAt === null
                )
                  return false;
                if (where.expiresAt?.gt && i.expiresAt.getTime() <= where.expiresAt.gt.getTime())
                  return false;
                if (where.id && i.id !== where.id) return false;
                return true;
              })
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
          );
        }),
        findMany: jest.fn(async ({ where, orderBy }: any) => {
          let rows = Array.from(invitationStore.values()).filter((i) => {
            if (where.tenantId && i.tenantId !== where.tenantId) return false;
            return true;
          });
          if (orderBy?.createdAt === 'desc') {
            rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          }
          return rows;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = invitationStore.get(where.id);
          if (!row) throw new Error('NOT_FOUND');
          if (data.acceptedAt !== undefined) row.acceptedAt = data.acceptedAt;
          if (data.acceptedById !== undefined) row.acceptedById = data.acceptedById;
          return row;
        }),
        delete: jest.fn(async ({ where }: any) => {
          const row = invitationStore.get(where.id);
          if (!row) throw new Error('NOT_FOUND');
          invitationStore.delete(where.id);
          return row;
        }),
      },
    };

    systemEvents = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SystemEventsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantInvitationsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'TENANT_INVITATION_TTL_HOURS' ? '24' : undefined) },
        },
        { provide: SystemEventsService, useValue: systemEvents },
      ],
    }).compile();

    service = module.get(TenantInvitationsService);
  });

  // ---------- create ----------

  it('creates an invitation with hex token, default 24h TTL', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const result = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'newop@a.com',
      role: Role.operator,
    });

    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    const ttlMs = result.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
    expect(systemEvents.logEvent).toHaveBeenCalledWith(
      EventType.TENANT_INVITATION_CREATED,
      expect.any(String),
      expect.objectContaining({ invitationId: result.id }),
      inviter.id,
      expect.any(String),
      'tenant-a',
    );
  });

  it('rejects invite when user already member of this tenant', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const existing = await seedUser({ email: 'op@a.com', role: Role.operator });
    seedMembership(existing.id, 'tenant-a', Role.operator);

    await expect(
      service.create('tenant-a', inviter.id, Role.admin, {
        email: 'op@a.com',
        role: Role.operator,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('forbids supervisor from granting admin role', async () => {
    const inviter = await seedUser({ email: 'sup@a.com', role: Role.supervisor });
    await expect(
      service.create('tenant-a', inviter.id, Role.supervisor, {
        email: 'new@a.com',
        role: Role.admin,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects empty tenantId', async () => {
    await expect(
      service.create('', null, Role.admin, { email: 'x@a.com', role: Role.operator }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicated open invite for same email', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'new@a.com',
      role: Role.operator,
    });
    await expect(
      service.create('tenant-a', inviter.id, Role.admin, {
        email: 'new@a.com',
        role: Role.operator,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ---------- listForTenant ----------

  it('listForTenant returns ONLY current tenant invites, never the token', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'a1@a.com',
      role: Role.operator,
    });
    await service.create('tenant-b', inviter.id, Role.admin, {
      email: 'b1@b.com',
      role: Role.operator,
    });

    const list = await service.listForTenant('tenant-a');
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe('a1@a.com');
    expect((list[0] as any).token).toBeUndefined();
  });

  // ---------- preview ----------

  it('preview returns public-safe payload (no token, no internal ids)', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'new@a.com',
      role: Role.operator,
    });
    const preview = await service.preview(inv.token);
    expect(preview).toEqual({
      email: 'new@a.com',
      role: Role.operator,
      tenantId: 'tenant-a',
      tenantName: 'Tenant A',
      invitedByName: inviter.name,
      expiresAt: inv.expiresAt,
      isExpired: false,
      isAccepted: false,
    });
    expect((preview as any).token).toBeUndefined();
  });

  it('preview returns 404 for unknown / short token', async () => {
    await expect(service.preview('short')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.preview(randomBytes(32).toString('hex'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ---------- accept ----------

  it('accept creates new account when neither account nor session exists', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'new@a.com',
      role: Role.operator,
    });

    const result = await service.accept(inv.token, { name: 'New', password: 'supersecret' }, null);
    expect(result.alreadyMember).toBe(false);
    expect(result.user.email).toBe('new@a.com');
    expect(result.tenantId).toBe('tenant-a');

    const userRow = Array.from(userStore.values()).find((u) => u.email === 'new@a.com')!;
    const memb = membershipStore.get(membershipKey(userRow.id, 'tenant-a'));
    expect(memb?.role).toBe(Role.operator);

    const updated = Array.from(invitationStore.values()).find((i) => i.token === inv.token)!;
    expect(updated.acceptedAt).not.toBeNull();
    expect(updated.acceptedById).toBe(userRow.id);
  });

  it('accept attaches existing account with valid password', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const existing = await seedUser({ email: 'op@a.com', role: Role.operator });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'op@a.com',
      role: Role.operator,
    });
    const result = await service.accept(
      inv.token,
      { password: 'correct-horse-battery' },
      null,
    );
    expect(result.user.id).toBe(existing.id);
    expect(result.alreadyMember).toBe(false);
  });

  it('accept rejects existing account with wrong password', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    await seedUser({ email: 'op@a.com', role: Role.operator });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'op@a.com',
      role: Role.operator,
    });
    await expect(
      service.accept(inv.token, { password: 'wrong-password' }, null),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accept rejects when authenticated user email does not match invite email', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const intruder = await seedUser({ email: 'eve@evil.com', role: Role.operator });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'target@a.com',
      role: Role.operator,
    });
    await expect(service.accept(inv.token, {}, intruder.id)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accept is idempotent — second call returns alreadyMember=true', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'new@a.com',
      role: Role.operator,
    });
    await service.accept(inv.token, { name: 'New', password: 'supersecret' }, null);
    const second = await service.accept(
      inv.token,
      { name: 'New', password: 'supersecret' },
      null,
    );
    expect(second.alreadyMember).toBe(true);
  });

  it('accept refuses expired invitation', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'new@a.com',
      role: Role.operator,
      ttlHours: 1,
    });
    const row = Array.from(invitationStore.values()).find((i) => i.token === inv.token)!;
    row.expiresAt = new Date(Date.now() - 1000);

    await expect(
      service.accept(inv.token, { name: 'New', password: 'supersecret' }, null),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ---------- revoke ----------

  it('revoke removes a pending invite and audits', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'new@a.com',
      role: Role.operator,
    });
    await service.revoke('tenant-a', inv.id, inviter.id);
    expect(invitationStore.get(inv.id)).toBeUndefined();
    expect(systemEvents.logEvent).toHaveBeenCalledWith(
      EventType.TENANT_INVITATION_REVOKED,
      expect.any(String),
      expect.objectContaining({ invitationId: inv.id }),
      inviter.id,
      expect.any(String),
      'tenant-a',
    );
  });

  it('revoke from other tenant returns 404', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'new@a.com',
      role: Role.operator,
    });
    await expect(service.revoke('tenant-b', inv.id, inviter.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('revoke refuses already-accepted invite', async () => {
    const inviter = await seedUser({ email: 'admin@a.com', role: Role.admin });
    const inv = await service.create('tenant-a', inviter.id, Role.admin, {
      email: 'new@a.com',
      role: Role.operator,
    });
    await service.accept(inv.token, { name: 'New', password: 'supersecret' }, null);
    await expect(service.revoke('tenant-a', inv.id, inviter.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
