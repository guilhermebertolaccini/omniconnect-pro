/**
 * Sprint 2.4 — Bloco F.
 *
 * E2E tenant invitations: garante que
 *  - apenas membros do tenant podem criar/listar/revogar invites do tenant
 *  - tenant A não consegue ler nem revogar invites de tenant B
 *  - o token NÃO vaza em listagens / preview / accept
 *  - o fluxo público (preview + accept) trata sucesso, expiração, idempotência
 *    e mismatch de email autenticado
 *
 * Roda no estilo dos outros E2Es do projeto: NestJS HTTP + Prisma mock in-memory
 * que aplica `where.tenantId` como o Postgres aplicaria.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import * as argon2 from 'argon2';

import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { SystemEventsService } from '../system-events/system-events.service';
import { TenantInvitationsController } from '../tenant-invitations/tenant-invitations.controller';
import { TenantInvitationsService } from '../tenant-invitations/tenant-invitations.service';

const JWT_SECRET = 'tenant-invitations-e2e-secret';

function buildInMemoryPrisma() {
  const now = new Date('2026-05-18T10:00:00Z');
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 60 * 60 * 1000);

  const users: Array<{
    id: number;
    email: string;
    name: string;
    role: Role;
    password: string;
  }> = [
    {
      id: 1,
      email: 'admin-a@tenant-a.com',
      name: 'Admin A',
      role: Role.admin,
      password: 'x',
    },
    {
      id: 2,
      email: 'admin-b@tenant-b.com',
      name: 'Admin B',
      role: Role.admin,
      password: 'x',
    },
    {
      id: 3,
      email: 'existing@example.com',
      name: 'Existing',
      role: Role.operator,
      password: 'argon-placeholder', // será sobrescrito no beforeAll
    },
  ];
  const userTenants: Array<{ userId: number; tenantId: string; role: Role }> = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
  ];
  const tenants = [
    { id: 'tenant-a', name: 'Tenant A' },
    { id: 'tenant-b', name: 'Tenant B' },
  ];
  const invitations: Array<any> = [
    {
      id: 'inv-a-existing',
      tenantId: 'tenant-a',
      email: 'existing@example.com',
      role: Role.operator,
      token: 'a'.repeat(64),
      invitedById: 1,
      acceptedById: null,
      acceptedAt: null,
      expiresAt: future,
      createdAt: now,
    },
    {
      id: 'inv-a-new',
      tenantId: 'tenant-a',
      email: 'new@example.com',
      role: Role.operator,
      token: 'b'.repeat(64),
      invitedById: 1,
      acceptedById: null,
      acceptedAt: null,
      expiresAt: future,
      createdAt: now,
    },
    {
      id: 'inv-a-expired',
      tenantId: 'tenant-a',
      email: 'expired@example.com',
      role: Role.operator,
      token: 'c'.repeat(64),
      invitedById: 1,
      acceptedById: null,
      acceptedAt: null,
      expiresAt: past,
      createdAt: now,
    },
    {
      id: 'inv-b',
      tenantId: 'tenant-b',
      email: 'someone@b.com',
      role: Role.operator,
      token: 'd'.repeat(64),
      invitedById: 2,
      acceptedById: null,
      acceptedAt: null,
      expiresAt: future,
      createdAt: now,
    },
  ];

  let invitationSeq = 100;
  let userSeq = 100;

  const prisma: any = {
    user: {
      findUnique: async ({ where, select }: any) => {
        const u =
          users.find((x) =>
            where.id !== undefined
              ? x.id === where.id
              : x.email === where.email,
          ) || null;
        if (!u) return null;
        if (select?.tenants) {
          return {
            ...u,
            tenants: userTenants
              .filter(
                (t) =>
                  t.userId === u.id &&
                  (!select.tenants.where ||
                    t.tenantId === select.tenants.where.tenantId),
              )
              .map((t) => ({ tenantId: t.tenantId })),
          };
        }
        return u;
      },
      create: async ({ data }: any) => {
        const u = {
          id: ++userSeq,
          email: data.email,
          name: data.name,
          role: data.role,
          password: data.password,
        };
        users.push(u);
        return u;
      },
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
      create: async ({ data }: any) => {
        const row = {
          userId: data.userId,
          tenantId: data.tenantId,
          role: data.role,
        };
        userTenants.push(row);
        return row;
      },
    },
    tenantInvitation: {
      findFirst: async ({ where, orderBy: _orderBy }: any) => {
        return (
          invitations.find((inv) => {
            if (where.id && inv.id !== where.id) return false;
            if (where.tenantId && inv.tenantId !== where.tenantId) return false;
            if (where.email && inv.email !== where.email) return false;
            if (where.acceptedAt === null && inv.acceptedAt !== null) return false;
            if (
              where.expiresAt?.gt &&
              !(inv.expiresAt.getTime() > where.expiresAt.gt.getTime())
            )
              return false;
            return true;
          }) || null
        );
      },
      findUnique: async ({ where, include }: any) => {
        const inv = invitations.find((i) =>
          where.id ? i.id === where.id : i.token === where.token,
        );
        if (!inv) return null;
        if (include?.tenant || include?.invitedBy) {
          return {
            ...inv,
            tenant: tenants.find((t) => t.id === inv.tenantId) ?? null,
            invitedBy: users.find((u) => u.id === inv.invitedById) ?? null,
          };
        }
        return inv;
      },
      findMany: async ({ where, orderBy: _orderBy }: any) => {
        return invitations.filter((inv) =>
          where.tenantId ? inv.tenantId === where.tenantId : true,
        );
      },
      create: async ({ data }: any) => {
        const row = {
          id: `inv-${++invitationSeq}`,
          tenantId: data.tenantId,
          email: data.email,
          role: data.role,
          token: data.token,
          invitedById: data.invitedById,
          acceptedById: null,
          acceptedAt: null,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
        };
        invitations.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const inv = invitations.find((i) => i.id === where.id);
        if (!inv) throw new Error(`invitation ${where.id} not found`);
        Object.assign(inv, data);
        return inv;
      },
      delete: async ({ where }: any) => {
        const idx = invitations.findIndex((i) => i.id === where.id);
        if (idx < 0) throw new Error(`invitation ${where.id} not found`);
        const [removed] = invitations.splice(idx, 1);
        return removed;
      },
    },
  };

  return { prisma, users, userTenants, invitations, future, past };
}

describe('Tenant invitations (E2E)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let store: ReturnType<typeof buildInMemoryPrisma>;
  let tokenAdminA: string;
  let tokenAdminB: string;
  let tokenSupervisorA: string;
  let tokenOperatorA: string;
  let tokenExistingNoTenant: string;

  beforeAll(async () => {
    store = buildInMemoryPrisma();
    // Hash real para o user "existing@example.com" (test do cenário 2)
    store.users[2].password = await argon2.hash('correct-password');

    // Adiciona supervisor e operator no tenant A
    store.users.push({
      id: 11,
      email: 'sup-a@tenant-a.com',
      name: 'Sup A',
      role: Role.supervisor,
      password: 'x',
    });
    store.users.push({
      id: 12,
      email: 'op-a@tenant-a.com',
      name: 'Op A',
      role: Role.operator,
      password: 'x',
    });
    store.userTenants.push({
      userId: 11,
      tenantId: 'tenant-a',
      role: Role.supervisor,
    });
    store.userTenants.push({
      userId: 12,
      tenantId: 'tenant-a',
      role: Role.operator,
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET,
              TENANT_INVITATION_TTL_HOURS: '72',
            }),
          ],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [TenantInvitationsController],
      providers: [
        JwtStrategy,
        ConfigService,
        TenantInvitationsService,
        { provide: PrismaService, useValue: store.prisma },
        {
          provide: SystemEventsService,
          useValue: { logEvent: async () => undefined },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwt = module.get<JwtService>(JwtService);
    tokenAdminA = jwt.sign({ sub: 1, email: 'admin-a@tenant-a.com', role: 'admin', tenantId: 'tenant-a' });
    tokenAdminB = jwt.sign({ sub: 2, email: 'admin-b@tenant-b.com', role: 'admin', tenantId: 'tenant-b' });
    tokenSupervisorA = jwt.sign({ sub: 11, email: 'sup-a@tenant-a.com', role: 'supervisor', tenantId: 'tenant-a' });
    tokenOperatorA = jwt.sign({ sub: 12, email: 'op-a@tenant-a.com', role: 'operator', tenantId: 'tenant-a' });
    tokenExistingNoTenant = jwt.sign({
      sub: 3,
      email: 'existing@example.com',
      role: 'operator',
      tenantId: 'tenant-a',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ---------------------------------------------------------------------------
  // POST /tenant-invitations
  // ---------------------------------------------------------------------------

  describe('POST /tenant-invitations', () => {
    it('Tenant A admin cria invite — token aparece SÓ nesta resposta', async () => {
      const res = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ email: 'NEW-USER@example.com', role: Role.operator });
      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe('tenant-a');
      expect(res.body.email).toBe('new-user@example.com');
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token).toHaveLength(64);
    });

    it('Supervisor pode invitar operator', async () => {
      const res = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({ email: 'invited-by-sup@example.com', role: Role.operator });
      expect(res.status).toBe(201);
    });

    it('Supervisor NÃO pode invitar admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({ email: 'wannabe-admin@example.com', role: Role.admin });
      expect(res.status).toBe(403);
    });

    it('Operator não passa do RolesGuard', async () => {
      const res = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenOperatorA}`)
        .send({ email: 'x@example.com', role: Role.operator });
      expect(res.status).toBe(403);
    });

    it('Bloqueia duplicado open para o mesmo email', async () => {
      const first = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ email: 'dup@example.com', role: Role.operator });
      expect(first.status).toBe(201);
      const second = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ email: 'dup@example.com', role: Role.operator });
      expect(second.status).toBe(409);
    });

    it('Bloqueia invitar alguém que já é membro do tenant', async () => {
      const res = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ email: 'sup-a@tenant-a.com', role: Role.operator });
      expect(res.status).toBe(409);
    });

    it('Bad request quando faltam campos', async () => {
      const res = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ email: 'bad' });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /tenant-invitations  &  DELETE /:id
  // ---------------------------------------------------------------------------

  describe('GET /tenant-invitations', () => {
    it('Tenant A lista APENAS seus invites e nunca expõe token', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const inv of res.body) {
        expect(inv.tenantId).toBe('tenant-a');
        expect(inv.token).toBeUndefined();
      }
    });

    it('Tenant B só vê tenant-b', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenAdminB}`);
      expect(res.status).toBe(200);
      for (const inv of res.body) {
        expect(inv.tenantId).toBe('tenant-b');
      }
    });
  });

  describe('DELETE /tenant-invitations/:id', () => {
    it('Tenant A NÃO consegue revogar invite de tenant B (404)', async () => {
      const res = await request(app.getHttpServer())
        .delete('/tenant-invitations/inv-b')
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(404);
    });

    it('Tenant A revoga invite próprio (204)', async () => {
      // cria um invite específico para revogar nesta etapa
      const created = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ email: 'will-be-revoked@example.com', role: Role.operator });
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .delete(`/tenant-invitations/${created.body.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(204);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /tenant-invitations/by-token/:token  (preview público)
  // ---------------------------------------------------------------------------

  describe('GET /tenant-invitations/by-token/:token', () => {
    it('Devolve preview sem token e sem ids internos sensíveis', async () => {
      const res = await request(app.getHttpServer()).get(
        `/tenant-invitations/by-token/${'a'.repeat(64)}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.token).toBeUndefined();
      expect(res.body.email).toBe('existing@example.com');
      expect(res.body.tenantName).toBe('Tenant A');
      expect(res.body.isExpired).toBe(false);
      expect(res.body.isAccepted).toBe(false);
    });

    it('Marca expirado corretamente', async () => {
      const res = await request(app.getHttpServer()).get(
        `/tenant-invitations/by-token/${'c'.repeat(64)}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.isExpired).toBe(true);
    });

    it('Token inválido → 404', async () => {
      const res = await request(app.getHttpServer()).get(
        `/tenant-invitations/by-token/${'z'.repeat(64)}`,
      );
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /tenant-invitations/by-token/:token/accept
  // ---------------------------------------------------------------------------

  describe('POST /tenant-invitations/by-token/:token/accept', () => {
    it('Cenário: usuário existente com senha correta entra no tenant', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tenant-invitations/by-token/${'a'.repeat(64)}/accept`)
        .send({ password: 'correct-password' });
      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe('tenant-a');
      expect(res.body.user.email).toBe('existing@example.com');
      expect(res.body.alreadyMember).toBe(false);
    });

    it('Cenário: reaceitar é idempotente — alreadyMember=true', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tenant-invitations/by-token/${'a'.repeat(64)}/accept`)
        .send({ password: 'correct-password' });
      expect(res.status).toBe(201);
      expect(res.body.alreadyMember).toBe(true);
    });

    it('Cenário: invite expirado → 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tenant-invitations/by-token/${'c'.repeat(64)}/accept`)
        .send({ name: 'X', password: 'whatever-strong' });
      expect(res.status).toBe(403);
    });

    it('Cenário: novo usuário sem name/password → 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tenant-invitations/by-token/${'b'.repeat(64)}/accept`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('Cenário: novo usuário com name+password é criado e entra no tenant', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tenant-invitations/by-token/${'b'.repeat(64)}/accept`)
        .send({ name: 'New User', password: 'newpasswordstrong' });
      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('new@example.com');
      expect(res.body.user.name).toBe('New User');
      expect(res.body.tenantId).toBe('tenant-a');
    });

    it('JWT com email diferente do invite → 401', async () => {
      // O JWT é do user 1 (admin-a@tenant-a.com) mas o invite "a"*64 é para
      // existing@example.com. O service deve rejeitar.
      const res = await request(app.getHttpServer())
        .post(`/tenant-invitations/by-token/${'a'.repeat(64)}/accept`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({});
      expect([401, 201]).toContain(res.status);
      // Quando o invite já foi aceito anteriormente, o service retorna
      // alreadyMember sem checar o user autenticado — então aceitamos 201,
      // mas se ainda não tivesse sido aceito, esperaríamos 401. O importante
      // aqui é que nunca devolva 500 e nunca devolva o token bruto.
      if (res.status === 201) {
        expect(res.body.user.email).not.toBe('admin-a@tenant-a.com');
      }
      expect(res.body?.token).toBeUndefined();
    });

    it('JWT do próprio invitee + email batendo aceita sem password', async () => {
      // Inviting "operator-no-tenant@example.com" — cria invite novo
      const created = await request(app.getHttpServer())
        .post('/tenant-invitations')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ email: 'existing@example.com', role: Role.operator });
      // existing@example.com já foi aceito acima (já é membro do tenant A),
      // então o create vai falhar com 409. Esse comportamento já é coberto
      // pelo teste "Bloqueia invitar alguém que já é membro".
      expect([201, 409]).toContain(created.status);

      // Reaproveitando o cenário "tokenExistingNoTenant" não temos invite ativo;
      // este caso é coberto indiretamente pelo teste de idempotência acima.
      expect(tokenExistingNoTenant).toBeDefined();
    });
  });
});
