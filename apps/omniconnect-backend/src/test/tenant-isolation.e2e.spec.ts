/**
 * E2E tenant isolation smoke test.
 *
 * Boots a minimal NestJS HTTP app exposing the ContactsController with
 * the real JwtAuthGuard + JwtStrategy + RolesGuard wiring used in
 * production, and a Prisma layer backed by an in-memory store that
 * enforces tenantId filtering at the data layer. The store mirrors how
 * Postgres + Prisma would respond: queries with a `tenantId` filter
 * only return rows whose tenantId matches.
 *
 * Goal: prove via real HTTP requests that a JWT issued for tenant A
 * cannot read, mutate, or delete records belonging to tenant B.
 */

import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { ContactsController } from '../contacts/contacts.controller';
import { ContactsService } from '../contacts/contacts.service';
import { PhoneValidationService } from '../phone-validation/phone-validation.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';

const JWT_SECRET = 'tenant-isolation-e2e-secret';

interface ContactRow {
  id: number;
  tenantId: string;
  name: string;
  phone: string;
  cpf?: string | null;
  segment?: number | null;
  isCPC?: boolean | null;
  createdAt: Date;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'supervisor' | 'operator' | 'digital';
}

interface UserTenantRow {
  userId: number;
  tenantId: string;
  role: 'admin' | 'supervisor' | 'operator' | 'digital';
}

/**
 * Minimal in-memory Prisma mock. Only implements the methods used by
 * ContactsService + JwtStrategy. The contact methods deliberately
 * respect `where.tenantId` exactly like Postgres would, so the test
 * proves the service is filtering properly.
 */
function buildInMemoryPrisma() {
  const contacts: ContactRow[] = [];
  const users: UserRow[] = [];
  const userTenants: UserTenantRow[] = [];
  let nextContactId = 1;

  const matchesWhere = (row: ContactRow, where: any): boolean => {
    if (!where) return true;
    if (where.tenantId !== undefined && row.tenantId !== where.tenantId) {
      return false;
    }
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.phone !== undefined && row.phone !== where.phone) return false;
    return true;
  };

  const prisma: any = {
    _seedContact(c: Omit<ContactRow, 'id' | 'createdAt'>) {
      const row: ContactRow = {
        id: nextContactId++,
        createdAt: new Date(),
        ...c,
      };
      contacts.push(row);
      return row;
    },
    _seedUser(u: UserRow) {
      users.push(u);
      return u;
    },
    _seedUserTenant(ut: UserTenantRow) {
      userTenants.push(ut);
      return ut;
    },
    _allContacts() {
      return contacts.slice();
    },
    user: {
      findUnique: async ({ where: { id } }: any) => users.find((u) => u.id === id) || null,
    },
    userTenant: {
      findUnique: async ({ where }: any) => {
        const key = where.userId_tenantId;
        if (!key) return null;
        return (
          userTenants.find(
            (ut) => ut.userId === key.userId && ut.tenantId === key.tenantId,
          ) || null
        );
      },
    },
    contact: {
      findMany: async ({ where }: any) => {
        const out = contacts.filter((c) => matchesWhere(c, where));
        return out.sort((a, b) => +b.createdAt - +a.createdAt);
      },
      findFirst: async ({ where }: any) => {
        return contacts.find((c) => matchesWhere(c, where)) || null;
      },
      upsert: async ({ where, create, update }: any) => {
        const key = where.tenantId_phone;
        const existing = contacts.find(
          (c) => c.tenantId === key.tenantId && c.phone === key.phone,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: ContactRow = {
          id: nextContactId++,
          createdAt: new Date(),
          tenantId: create.tenantId,
          name: create.name,
          phone: create.phone,
          cpf: create.cpf ?? null,
          segment: create.segment ?? null,
          isCPC: create.isCPC ?? false,
        };
        contacts.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = contacts.find((c) => c.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = contacts.findIndex((c) => c.id === where.id);
        if (idx === -1) throw new Error('not found');
        const [removed] = contacts.splice(idx, 1);
        return removed;
      },
    },
  };

  return prisma;
}

describe('Tenant isolation (E2E)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: ReturnType<typeof buildInMemoryPrisma>;

  let tenantAToken: string;
  let tenantBToken: string;
  let contactA: ContactRow;
  let contactB: ContactRow;

  beforeAll(async () => {
    prisma = buildInMemoryPrisma();

    prisma._seedUser({ id: 1, email: 'a@tenant-a.com', name: 'User A', role: 'admin' });
    prisma._seedUser({ id: 2, email: 'b@tenant-b.com', name: 'User B', role: 'admin' });
    prisma._seedUserTenant({ userId: 1, tenantId: 'tenant-a', role: 'admin' });
    prisma._seedUserTenant({ userId: 2, tenantId: 'tenant-b', role: 'admin' });

    contactA = prisma._seedContact({
      tenantId: 'tenant-a',
      name: 'Alice from A',
      phone: '5511999990001',
    });
    contactB = prisma._seedContact({
      tenantId: 'tenant-b',
      name: 'Bob from B',
      phone: '5511999990002',
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET })],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [ContactsController],
      providers: [
        ContactsService,
        PhoneValidationService,
        JwtStrategy,
        ConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
    );
    await app.init();

    jwt = module.get<JwtService>(JwtService);

    tenantAToken = jwt.sign({ sub: 1, email: 'a@tenant-a.com', role: 'admin', tenantId: 'tenant-a' });
    tenantBToken = jwt.sign({ sub: 2, email: 'b@tenant-b.com', role: 'admin', tenantId: 'tenant-b' });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('JWT auth gate', () => {
    it('rejects requests without a Bearer token', async () => {
      const res = await request(app.getHttpServer()).get('/contacts');
      expect(res.status).toBe(401);
    });

    it('rejects requests with an invalid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/contacts')
        .set('Authorization', 'Bearer not-a-valid-jwt');
      expect(res.status).toBe(401);
    });

    it('rejects, in production, a JWT for a tenant the user is NOT a member of', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const smugglerToken = jwt.sign({
          sub: 1,
          email: 'a@tenant-a.com',
          role: 'admin',
          tenantId: 'tenant-b',
        });
        const res = await request(app.getHttpServer())
          .get('/contacts')
          .set('Authorization', `Bearer ${smugglerToken}`);
        expect(res.status).toBe(401);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  describe('GET /contacts (list)', () => {
    it('Tenant A only sees its own contacts', async () => {
      const res = await request(app.getHttpServer())
        .get('/contacts')
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].tenantId).toBe('tenant-a');
      expect(res.body[0].id).toBe(contactA.id);
      expect(res.body.find((c: any) => c.tenantId === 'tenant-b')).toBeUndefined();
    });

    it('Tenant B only sees its own contacts', async () => {
      const res = await request(app.getHttpServer())
        .get('/contacts')
        .set('Authorization', `Bearer ${tenantBToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].tenantId).toBe('tenant-b');
      expect(res.body[0].id).toBe(contactB.id);
    });
  });

  describe('GET /contacts/:id (read)', () => {
    it('Tenant A can read its own contact', async () => {
      const res = await request(app.getHttpServer())
        .get(`/contacts/${contactA.id}`)
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(contactA.id);
      expect(res.body.tenantId).toBe('tenant-a');
    });

    it("Tenant A CANNOT read Tenant B's contact (404, not 200)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/contacts/${contactB.id}`)
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(404);
    });

    it("Tenant B CANNOT read Tenant A's contact (404, not 200)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/contacts/${contactA.id}`)
        .set('Authorization', `Bearer ${tenantBToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /contacts/by-phone/:phone (read by phone)', () => {
    it("Tenant A CANNOT see Tenant B's contact even when knowing the phone", async () => {
      const res = await request(app.getHttpServer())
        .get(`/contacts/by-phone/${contactB.phone}`)
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });
  });

  describe('PATCH /contacts/:id (update)', () => {
    it("Tenant B CANNOT update Tenant A's contact (404 + state unchanged)", async () => {
      const before = prisma._allContacts().find((c) => c.id === contactA.id);
      const res = await request(app.getHttpServer())
        .patch(`/contacts/${contactA.id}`)
        .set('Authorization', `Bearer ${tenantBToken}`)
        .send({ name: 'Hijacked by Tenant B' });

      expect(res.status).toBe(404);
      const after = prisma._allContacts().find((c) => c.id === contactA.id);
      expect(after?.name).toBe(before?.name);
      expect(after?.name).not.toBe('Hijacked by Tenant B');
    });

    it('Tenant A can update its own contact', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/contacts/${contactA.id}`)
        .set('Authorization', `Bearer ${tenantAToken}`)
        .send({ name: 'Alice (renamed)' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Alice (renamed)');
      expect(res.body.tenantId).toBe('tenant-a');
    });
  });

  describe('DELETE /contacts/:id', () => {
    it("Tenant A CANNOT delete Tenant B's contact (404 + still present)", async () => {
      const res = await request(app.getHttpServer())
        .delete(`/contacts/${contactB.id}`)
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(res.status).toBe(404);
      const stillThere = prisma._allContacts().find((c) => c.id === contactB.id);
      expect(stillThere).toBeDefined();
      expect(stillThere?.tenantId).toBe('tenant-b');
    });
  });

  describe('POST /contacts (create)', () => {
    it('writes are stamped with the caller tenantId (Tenant A)', async () => {
      const res = await request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${tenantAToken}`)
        .send({ name: 'New A contact', phone: '11988887777' });

      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe('tenant-a');
    });

    it('Tenant A cannot smuggle a tenantId in the body (DTO has no such field)', async () => {
      const res = await request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${tenantAToken}`)
        .send({ name: 'Smuggler', phone: '11988886666', tenantId: 'tenant-b' });

      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe('tenant-a');
      const inB = prisma._allContacts().filter((c) => c.tenantId === 'tenant-b' && c.name === 'Smuggler');
      expect(inB).toHaveLength(0);
    });
  });
});
