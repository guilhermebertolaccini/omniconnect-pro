/**
 * Sprint Hub — PR 4 (A6 do piloto).
 *
 * E2E `GET /dashboards/pilot-overview`:
 *  - exige autenticação e papel (admin / supervisor / digital);
 *  - tenant A NUNCA vê contagens de tenant B (cross-tenant isolation real);
 *  - regra de "recuperável" reflete `leadIntent ∈ {qualificado, quente,
 *    pronto_para_visita}` AND (lostOpportunity OR risk alto/crítico OR
 *    nextBestAction com padrão de recovery);
 *  - `lossOrAbandonmentSignals` agrega lost/lead-abandon/seller-abandon;
 *  - `aiCost` soma `AIUsageLog.estimatedCost` (status=success) por tenant;
 *  - filtro `origin=ads` afeta `leadsIngested` (contagem de
 *    `IntegrationEvent` provider=ads, status=processed).
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
import { DashboardsController } from '../dashboards/dashboards.controller';
import { DashboardsService } from '../dashboards/dashboards.service';

const JWT_SECRET = 'pilot-overview-e2e-secret';

interface AnalysisRow {
  tenantId: string;
  createdAt: Date;
  leadIntent: string;
  risk: string;
  lostOpportunity: boolean;
  hasLeadAbandonment: boolean;
  hasSellerAbandonment: boolean;
  nextBestAction: string;
}

interface UsageRow {
  tenantId: string;
  createdAt: Date;
  estimatedCost: number;
  currency: string;
  status: string;
}

interface EventRow {
  tenantId: string;
  provider: string;
  status: string;
  createdAt: Date;
}

interface ConvRow {
  tenantId: string;
  createdAt: Date;
}

function buildPrisma() {
  const now = new Date('2026-05-20T12:00:00Z');
  const inWindow = new Date('2026-05-19T12:00:00Z');
  const outWindow = new Date('2026-03-01T00:00:00Z');

  const users = [
    { id: 1, email: 'admin-a@a.com', role: Role.admin },
    { id: 2, email: 'admin-b@b.com', role: Role.admin },
    { id: 3, email: 'broker-a@a.com', role: Role.broker },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
    { userId: 3, tenantId: 'tenant-a', role: Role.broker },
  ];

  const conversations: ConvRow[] = [
    { tenantId: 'tenant-a', createdAt: inWindow },
    { tenantId: 'tenant-a', createdAt: inWindow },
    { tenantId: 'tenant-a', createdAt: inWindow },
    { tenantId: 'tenant-a', createdAt: outWindow }, // fora da janela
    { tenantId: 'tenant-b', createdAt: inWindow },
  ];

  const integrationEvents: EventRow[] = [
    // Tenant A
    { tenantId: 'tenant-a', provider: 'ads', status: 'processed', createdAt: inWindow },
    { tenantId: 'tenant-a', provider: 'ads', status: 'processed', createdAt: inWindow },
    { tenantId: 'tenant-a', provider: 'ads', status: 'failed', createdAt: inWindow },
    { tenantId: 'tenant-a', provider: 'bot', status: 'processed', createdAt: inWindow },
    { tenantId: 'tenant-a', provider: 'bot', status: 'processed', createdAt: inWindow },
    // Tenant B
    { tenantId: 'tenant-b', provider: 'ads', status: 'processed', createdAt: inWindow },
    { tenantId: 'tenant-b', provider: 'bot', status: 'processed', createdAt: inWindow },
  ];

  const analyses: AnalysisRow[] = [
    // Tenant A — uma recuperável (lost + qualificado), uma loss-only (lead abandon),
    // uma neutra (frio + sem loss)
    {
      tenantId: 'tenant-a',
      createdAt: inWindow,
      leadIntent: 'qualificado',
      risk: 'medio',
      lostOpportunity: true,
      hasLeadAbandonment: false,
      hasSellerAbandonment: false,
      nextBestAction: 'Agendar visita ao decorado.',
    },
    {
      tenantId: 'tenant-a',
      createdAt: inWindow,
      leadIntent: 'frio',
      risk: 'baixo',
      lostOpportunity: false,
      hasLeadAbandonment: true,
      hasSellerAbandonment: false,
      nextBestAction: 'Nenhuma ação.',
    },
    {
      tenantId: 'tenant-a',
      createdAt: inWindow,
      leadIntent: 'quente',
      risk: 'alto',
      lostOpportunity: false,
      hasLeadAbandonment: false,
      hasSellerAbandonment: false,
      nextBestAction: 'Reengajar lead com simulação.',
    },
    // Tenant B — NÃO deve vazar para tenant-a; tudo recuperável aqui
    {
      tenantId: 'tenant-b',
      createdAt: inWindow,
      leadIntent: 'quente',
      risk: 'critico',
      lostOpportunity: true,
      hasLeadAbandonment: true,
      hasSellerAbandonment: true,
      nextBestAction: 'Retomar contato.',
    },
  ];

  const usage: UsageRow[] = [
    {
      tenantId: 'tenant-a',
      createdAt: inWindow,
      estimatedCost: 0.012,
      currency: 'USD',
      status: 'success',
    },
    {
      tenantId: 'tenant-a',
      createdAt: inWindow,
      estimatedCost: 0.008,
      currency: 'USD',
      status: 'success',
    },
    {
      tenantId: 'tenant-a',
      createdAt: inWindow,
      estimatedCost: 0.05,
      currency: 'USD',
      status: 'failed', // não soma
    },
    {
      tenantId: 'tenant-b',
      createdAt: inWindow,
      estimatedCost: 1.0, // valor alto — se vazar p/ A, teste falha
      currency: 'USD',
      status: 'success',
    },
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
        return row ? { role: row.role } : null;
      },
    },
    conversation: {
      count: async ({ where }: any) => {
        return conversations.filter(
          (c) =>
            c.tenantId === where.tenantId &&
            (!where.createdAt ||
              (c.createdAt >= where.createdAt.gte &&
                c.createdAt <= where.createdAt.lte)),
        ).length;
      },
    },
    integrationEvent: {
      count: async ({ where }: any) =>
        integrationEvents.filter(
          (e) =>
            e.tenantId === where.tenantId &&
            (!where.provider || e.provider === where.provider) &&
            (!where.status || e.status === where.status) &&
            (!where.createdAt ||
              (e.createdAt >= where.createdAt.gte &&
                e.createdAt <= where.createdAt.lte)),
        ).length,
    },
    conversationAIAnalysis: {
      count: async ({ where }: any) =>
        analyses.filter(
          (a) =>
            a.tenantId === where.tenantId &&
            (!where.createdAt ||
              (a.createdAt >= where.createdAt.gte &&
                a.createdAt <= where.createdAt.lte)),
        ).length,
      findMany: async ({ where, select: _select, take: _take }: any) =>
        analyses
          .filter(
            (a) =>
              a.tenantId === where.tenantId &&
              (!where.createdAt ||
                (a.createdAt >= where.createdAt.gte &&
                  a.createdAt <= where.createdAt.lte)),
          )
          .map((a) => ({
            leadIntent: a.leadIntent,
            risk: a.risk,
            lostOpportunity: a.lostOpportunity,
            hasLeadAbandonment: a.hasLeadAbandonment,
            hasSellerAbandonment: a.hasSellerAbandonment,
            nextBestAction: a.nextBestAction,
          })),
    },
    aIUsageLog: {
      findMany: async ({ where, select: _select }: any) =>
        usage
          .filter(
            (u) =>
              u.tenantId === where.tenantId &&
              (!where.status || u.status === where.status) &&
              (!where.createdAt ||
                (u.createdAt >= where.createdAt.gte &&
                  u.createdAt <= where.createdAt.lte)),
          )
          .map((u) => ({ estimatedCost: u.estimatedCost, currency: u.currency })),
    },
  };

  return { prisma, users, userTenants };
}

describe('GET /dashboards/pilot-overview (E2E)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let store: ReturnType<typeof buildPrisma>;

  beforeAll(async () => {
    store = buildPrisma();

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
      controllers: [DashboardsController],
      providers: [
        JwtStrategy,
        DashboardsService,
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
      role: user.role,
      tenantId,
      tenantRole: role,
    });
  }

  const wide = '?from=2026-04-20T00:00:00.000Z&to=2026-05-21T00:00:00.000Z';

  it('exige autenticação', async () => {
    await request(app.getHttpServer()).get('/dashboards/pilot-overview').expect(401);
  });

  it('rejeita papel sem acesso (broker)', async () => {
    const token = sign(3, 'tenant-a', Role.broker);
    await request(app.getHttpServer())
      .get(`/dashboards/pilot-overview${wide}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('admin de tenant A vê só métricas de tenant A', async () => {
    const token = sign(1, 'tenant-a', Role.admin);
    const res = await request(app.getHttpServer())
      .get(`/dashboards/pilot-overview${wide}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body.data;
    expect(body.leadsIngested).toBe(2); // 2 ads processed (1 failed não conta)
    expect(body.conversationsCreated).toBe(3); // 3 dentro da janela
    expect(body.botifyHandoffs).toBe(2);
    expect(body.insightAnalyses).toBe(3);
    // Recuperáveis tenant A:
    //   - row1: qualificado + lost                       ✓
    //   - row3: quente + risk=alto                       ✓
    //   - row2: frio (intent falha)                      ✗
    expect(body.recoverableOpportunities).toBe(2);
    // Loss/abandon tenant A: row1 (lost) + row2 (lead abandon) = 2
    expect(body.lossOrAbandonmentSignals).toBe(2);
    // Custo: 0.012 + 0.008 = 0.020 USD; o 0.05 (failed) não soma
    expect(body.aiCost.amount).toBeCloseTo(0.02, 6);
    expect(body.aiCost.currency).toBe('USD');

    // Não vazou nada de tenant B.
    const dump = JSON.stringify(body);
    expect(dump).not.toContain('tenant-b');
    expect(body.aiCost.amount).toBeLessThan(1); // sanity: nada do row de B (1.0)
  });

  it('admin de tenant B vê só métricas de tenant B', async () => {
    const token = sign(2, 'tenant-b', Role.admin);
    const res = await request(app.getHttpServer())
      .get(`/dashboards/pilot-overview${wide}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body.data;
    expect(body.leadsIngested).toBe(1);
    expect(body.conversationsCreated).toBe(1);
    expect(body.botifyHandoffs).toBe(1);
    expect(body.insightAnalyses).toBe(1);
    expect(body.recoverableOpportunities).toBe(1); // quente + lost
    expect(body.lossOrAbandonmentSignals).toBe(1);
    expect(body.aiCost.amount).toBeCloseTo(1.0, 6);
  });

  it('rolling window default (days=30) volta janela razoável', async () => {
    const token = sign(1, 'tenant-a', Role.admin);
    const res = await request(app.getHttpServer())
      .get('/dashboards/pilot-overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.period.from).toBeDefined();
    expect(res.body.data.period.to).toBeDefined();
    // Origin default é `all`
    expect(res.body.data.origin).toBe('all');
  });

  it('origin=ads é refletido na resposta', async () => {
    const token = sign(1, 'tenant-a', Role.admin);
    const res = await request(app.getHttpServer())
      .get(`/dashboards/pilot-overview${wide}&origin=ads`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.origin).toBe('ads');
    expect(res.body.data.leadsIngested).toBe(2);
  });

  it('from sem to ⇒ 400', async () => {
    const token = sign(1, 'tenant-a', Role.admin);
    await request(app.getHttpServer())
      .get('/dashboards/pilot-overview?from=2026-04-20T00:00:00.000Z')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('origin inválido ⇒ 400', async () => {
    const token = sign(1, 'tenant-a', Role.admin);
    await request(app.getHttpServer())
      .get(`/dashboards/pilot-overview${wide}&origin=nope`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
