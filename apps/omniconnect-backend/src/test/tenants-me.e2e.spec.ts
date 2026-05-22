/**
 * Sprint Hub — PR 3 (ADR-0003).
 *
 * E2E `GET /tenants/me`:
 *  - autenticado lê apenas as memberships do user atual;
 *  - usuário em tenant A jamais vê tenant B nas memberships;
 *  - JWT sem `tenantId` em produção é rejeitado pelo `JwtStrategy` antes de
 *    chegar aqui (cobertura cruzada das specs de auth — não repetimos aqui);
 *  - papéis (`Role`) vêm direto do `UserTenant.role`, não do `User.role`
 *    global — confirma o canonical role enum por tenant.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';

import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { TenantsController } from '../tenants/tenants.controller';
import { TenantsService } from '../tenants/tenants.service';

const JWT_SECRET = 'tenants-me-e2e-secret';

function buildInMemoryPrisma() {
  const tenants = [
    { id: 'tenant-a', name: 'Tenant A', isActive: true },
    { id: 'tenant-b', name: 'Tenant B', isActive: true },
    { id: 'tenant-c', name: 'Tenant C (inactive)', isActive: false },
  ];
  const users = [
    { id: 1, email: 'admin-a@a.com', name: 'Admin A', role: Role.admin },
    { id: 2, email: 'admin-b@b.com', name: 'Admin B', role: Role.admin },
    { id: 3, email: 'multi@x.com', name: 'Multi-tenant User', role: Role.operator },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
    { userId: 3, tenantId: 'tenant-a', role: Role.broker },
    { userId: 3, tenantId: 'tenant-c', role: Role.digital },
  ];

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        users.find((u) => u.id === where.id) ?? null,
    },
    userTenant: {
      findUnique: async ({ where }: any) => {
        const key = where.userId_tenantId;
        if (!key) return null;
        const row = userTenants.find(
          (m) => m.userId === key.userId && m.tenantId === key.tenantId,
        );
        return row ? { role: row.role, userId: row.userId, tenantId: row.tenantId } : null;
      },
      findMany: async ({ where, include }: any) => {
        const rows = userTenants.filter((m) => m.userId === where.userId);
        if (!include?.tenant) return rows;
        return rows.map((r) => ({
          ...r,
          tenant: tenants.find((t) => t.id === r.tenantId) ?? null,
        }));
      },
    },
  };

  return { prisma, tenants, users, userTenants };
}

describe('GET /tenants/me (E2E)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let store: ReturnType<typeof buildInMemoryPrisma>;

  beforeAll(async () => {
    store = buildInMemoryPrisma();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET, NODE_ENV: 'test' })],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [TenantsController],
      providers: [
        JwtStrategy,
        TenantsService,
        { provide: PrismaService, useValue: store.prisma },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  function sign(userId: number, tenantId: string, role: Role): string {
    const user = store.users.find((u) => u.id === userId)!;
    return jwt.sign({
      sub: userId,
      id: userId,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId,
      tenantRole: role,
    });
  }

  it('exige autenticação', async () => {
    await request(app.getHttpServer()).get('/tenants/me').expect(401);
  });

  it('admin de tenant A só vê membership de tenant A', async () => {
    const token = sign(1, 'tenant-a', Role.admin);
    const res = await request(app.getHttpServer())
      .get('/tenants/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      data: [
        { tenantId: 'tenant-a', tenantName: 'Tenant A', role: Role.admin, isActive: true },
      ],
    });
    // Defesa explícita: NÃO leakou tenant B.
    expect(JSON.stringify(res.body)).not.toContain('tenant-b');
    expect(JSON.stringify(res.body)).not.toContain('Tenant B');
  });

  it('admin de tenant B vê apenas tenant B (cross-tenant isolation)', async () => {
    const token = sign(2, 'tenant-b', Role.admin);
    const res = await request(app.getHttpServer())
      .get('/tenants/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      tenantId: 'tenant-b',
      tenantName: 'Tenant B',
      role: Role.admin,
    });
    expect(JSON.stringify(res.body)).not.toContain('tenant-a');
  });

  it('user multi-tenant vê todas as suas memberships (e nada além)', async () => {
    const token = sign(3, 'tenant-a', Role.broker);
    const res = await request(app.getHttpServer())
      .get('/tenants/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    const tenantIds = res.body.data.map((m: any) => m.tenantId).sort();
    expect(tenantIds).toEqual(['tenant-a', 'tenant-c']);
    // O role vem de UserTenant.role, não de User.role global.
    const tenantA = res.body.data.find((m: any) => m.tenantId === 'tenant-a');
    expect(tenantA.role).toBe(Role.broker);
    const tenantC = res.body.data.find((m: any) => m.tenantId === 'tenant-c');
    expect(tenantC.role).toBe(Role.digital);
    expect(tenantC.isActive).toBe(false); // membership a tenant inativo permanece visível
  });

  it('JWT com userId desconhecido devolve lista vazia (não 500)', async () => {
    const token = jwt.sign({
      sub: 999,
      id: 999,
      email: 'ghost@x.com',
      name: 'Ghost',
      role: Role.operator,
      tenantId: 'tenant-a',
      tenantRole: Role.operator,
    });
    const res = await request(app.getHttpServer())
      .get('/tenants/me')
      .set('Authorization', `Bearer ${token}`);

    // O JwtStrategy pode rejeitar antes (sem User.findUnique correspondente).
    // Aceitamos 200 com lista vazia OU 401 — ambos preservam isolamento.
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.data).toEqual([]);
    }
  });
});
