/**
 * E2E tenant isolation for the InsightAI job endpoints.
 *
 * Boots the InsightAiController with the real
 * JwtAuthGuard + JwtStrategy + RolesGuard pipeline and an in-memory
 * Bull queue + Prisma mock. We prove via real HTTP requests that:
 *
 *   GET /insight-ai/jobs/:id
 *     - is 404 for jobs whose payload has no tenantId
 *     - is 404 (not 403) when the job belongs to another tenant
 *     - returns the state when the caller IS the owning tenant
 *
 *   GET /insight-ai/analyses
 *     - never returns analyses from another tenant
 *
 *   GET /insight-ai/dashboard/usage
 *     - never returns usage rows or aggregates from another tenant
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bull';
import request from 'supertest';

import { InsightAiController } from '../insight-ai/insight-ai.controller';
import { InsightAiService } from '../insight-ai/insight-ai.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { ModelPricingService } from '../model-pricing/model-pricing.service';
import { InsightAiLlmResolver } from '../insight-ai/providers/insight-ai-llm.resolver';

const JWT_SECRET = 'iai-isolation-e2e-secret';

interface AnalysisRow {
  id: number;
  tenantId: string;
  contactPhone: string;
  segment: number | null;
  createdAt: Date;
  sellerQualityScore: number;
  responseQualityScore: number;
  qualificationScore: number;
  followUpScore: number;
  lostOpportunity: boolean;
  hasSellerAbandonment: boolean;
  hasLeadAbandonment: boolean;
  hasSchedulingAttempt: boolean;
  hasProposalOrSimulationAttempt: boolean;
  leadIntent: string;
  opportunityStatus: string;
  risk: string;
  objections: string | null;
}

interface UsageRow {
  id: number;
  tenantId: string;
  modelProvider: string;
  modelName: string;
  operationType: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  currency: string;
  status: string;
  createdAt: Date;
  analysisId: number | null;
  conversationId: number | null;
}

function matchesAnalysisWhere(a: AnalysisRow, where: any): boolean {
  if (!where) return true;
  if (where.tenantId && a.tenantId !== where.tenantId) return false;
  if (where.contactPhone && a.contactPhone !== where.contactPhone) return false;
  if (where.segment !== undefined && where.segment !== null && a.segment !== where.segment) {
    return false;
  }
  const ca = where.createdAt;
  if (ca) {
    if (ca.gte && a.createdAt < ca.gte) return false;
    if (ca.lte && a.createdAt > ca.lte) return false;
  }
  return true;
}

function matchesUsageWhere(r: UsageRow, where: any): boolean {
  if (!where) return true;
  if (where.tenantId && r.tenantId !== where.tenantId) return false;
  if (where.status && r.status !== where.status) return false;
  const ca = where.createdAt;
  if (ca) {
    if (ca.gte && r.createdAt < ca.gte) return false;
    if (ca.lte && r.createdAt > ca.lte) return false;
  }
  return true;
}

function buildInMemoryPrisma() {
  const users = [
    { id: 1, email: 'a@tenant-a.com', role: 'admin' },
    { id: 2, email: 'b@tenant-b.com', role: 'admin' },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: 'admin' },
    { userId: 2, tenantId: 'tenant-b', role: 'admin' },
  ];
  const now = new Date();
  const analyses: AnalysisRow[] = [
    {
      id: 10,
      tenantId: 'tenant-a',
      contactPhone: '5511999990001',
      segment: 1,
      createdAt: now,
      sellerQualityScore: 50,
      responseQualityScore: 50,
      qualificationScore: 50,
      followUpScore: 50,
      lostOpportunity: false,
      hasSellerAbandonment: false,
      hasLeadAbandonment: false,
      hasSchedulingAttempt: false,
      hasProposalOrSimulationAttempt: false,
      leadIntent: 'frio',
      opportunityStatus: 'aberto',
      risk: 'baixo',
      objections: null,
    },
    {
      id: 20,
      tenantId: 'tenant-b',
      contactPhone: '5511999990002',
      segment: 2,
      createdAt: now,
      sellerQualityScore: 40,
      responseQualityScore: 40,
      qualificationScore: 40,
      followUpScore: 40,
      lostOpportunity: false,
      hasSellerAbandonment: false,
      hasLeadAbandonment: false,
      hasSchedulingAttempt: false,
      hasProposalOrSimulationAttempt: false,
      leadIntent: 'quente',
      opportunityStatus: 'aberto',
      risk: 'alto',
      objections: null,
    },
  ];

  const usageLogs: UsageRow[] = [
    {
      id: 100,
      tenantId: 'tenant-a',
      modelProvider: 'openai',
      modelName: 'gpt-4o-mini',
      operationType: 'conversation_analysis',
      promptTokens: 100,
      completionTokens: 50,
      estimatedCost: 0.01,
      currency: 'USD',
      status: 'success',
      createdAt: now,
      analysisId: 10,
      conversationId: 1,
    },
    {
      id: 200,
      tenantId: 'tenant-b',
      modelProvider: 'google',
      modelName: 'gemini-2.0-flash',
      operationType: 'conversation_analysis',
      promptTokens: 200,
      completionTokens: 100,
      estimatedCost: 0.02,
      currency: 'USD',
      status: 'success',
      createdAt: now,
      analysisId: 20,
      conversationId: 2,
    },
  ];

  return {
    user: {
      findUnique: async ({ where: { id } }: any) => users.find((u) => u.id === id) || null,
    },
    userTenant: {
      findUnique: async ({ where }: any) => {
        const key = where.userId_tenantId;
        return (
          userTenants.find(
            (ut) => ut.userId === key.userId && ut.tenantId === key.tenantId,
          ) || null
        );
      },
    },
    conversationAIAnalysis: {
      findMany: async ({ where, orderBy, skip, take }: any) => {
        let out = analyses.filter((a) => matchesAnalysisWhere(a, where));
        if (orderBy?.createdAt === 'desc') {
          out = [...out].sort((a, b) => +b.createdAt - +a.createdAt);
        }
        const s = skip ?? 0;
        const t = take ?? 50;
        return out.slice(s, s + t);
      },
      count: async ({ where }: any) => analyses.filter((a) => matchesAnalysisWhere(a, where)).length,
    },
    aIUsageLog: {
      groupBy: async ({ by, where }: any) => {
        let rows = usageLogs.filter((r) => matchesUsageWhere(r, where));
        if (by?.includes('modelProvider')) {
          const map = new Map<
            string,
            { promptTokens: number; completionTokens: number; estimatedCost: number; calls: number }
          >();
          for (const r of rows) {
            if (!map.has(r.modelProvider)) {
              map.set(r.modelProvider, { promptTokens: 0, completionTokens: 0, estimatedCost: 0, calls: 0 });
            }
            const m = map.get(r.modelProvider)!;
            m.promptTokens += r.promptTokens;
            m.completionTokens += r.completionTokens;
            m.estimatedCost += r.estimatedCost;
            m.calls += 1;
          }
          return Array.from(map.entries()).map(([modelProvider, v]) => ({
            modelProvider,
            _sum: {
              promptTokens: v.promptTokens,
              completionTokens: v.completionTokens,
              estimatedCost: v.estimatedCost,
            },
            _count: { _all: v.calls },
          }));
        }
        return [];
      },
      findMany: async ({ where, orderBy, skip, take, select: _sel }: any) => {
        let rows = usageLogs.filter((r) => matchesUsageWhere(r, where));
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => +b.createdAt - +a.createdAt);
        }
        const s = skip ?? 0;
        const t = take ?? 50;
        return rows.slice(s, s + t).map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          modelProvider: r.modelProvider,
          modelName: r.modelName,
          operationType: r.operationType,
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
          estimatedCost: r.estimatedCost,
          currency: r.currency,
          status: r.status,
          analysisId: r.analysisId,
          conversationId: r.conversationId,
        }));
      },
      count: async ({ where }: any) => usageLogs.filter((r) => matchesUsageWhere(r, where)).length,
    },
  } as any;
}

/**
 * Minimal Bull queue mock. Implements only what InsightAiService.getJobStatus
 * touches: getJob(id) -> { id, data, returnvalue, failedReason, attemptsMade,
 * getState() }. add() is a no-op for these specs.
 */
function buildInMemoryQueue(
  jobs: Record<string, { tenantId?: string; state?: string; returnvalue?: any }>,
) {
  return {
    add: jest.fn(async (_name, _data, opts) => ({ id: opts?.jobId ?? 'job-x' })),
    getJob: jest.fn(async (id: string) => {
      const entry = jobs[id];
      if (!entry) return null;
      return {
        id,
        data: entry.tenantId === undefined ? {} : { tenantId: entry.tenantId },
        returnvalue: entry.returnvalue,
        failedReason: null,
        attemptsMade: 1,
        getState: async () => entry.state ?? 'completed',
      };
    }),
  };
}

describe('Tenant isolation — InsightAI (E2E)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let tenantAToken: string;
  let tenantBToken: string;

  beforeAll(async () => {
    const prisma = buildInMemoryPrisma();
    const queue = buildInMemoryQueue({
      'iai:job-of-a': { tenantId: 'tenant-a', state: 'completed', returnvalue: { ok: true } },
      'iai:job-of-b': { tenantId: 'tenant-b', state: 'completed', returnvalue: { ok: true } },
      'iai:legacy': { tenantId: undefined, state: 'completed' },
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET })],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [InsightAiController],
      providers: [
        InsightAiService,
        JwtStrategy,
        ConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModelPricingService, useValue: { estimateCost: jest.fn() } },
        {
          provide: InsightAiLlmResolver,
          useValue: { resolve: jest.fn().mockReturnValue(null) },
        },
        { provide: getQueueToken('insight-ai'), useValue: queue },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwt = module.get<JwtService>(JwtService);
    tenantAToken = jwt.sign({ sub: 1, email: 'a@tenant-a.com', role: 'admin', tenantId: 'tenant-a' });
    tenantBToken = jwt.sign({ sub: 2, email: 'b@tenant-b.com', role: 'admin', tenantId: 'tenant-b' });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /insight-ai/jobs/:jobId', () => {
    it('tenant A reads its own job (happy path)', async () => {
      const res = await request(app.getHttpServer())
        .get('/insight-ai/jobs/iai:job-of-a')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ jobId: 'iai:job-of-a', status: 'completed' });
    });

    it("tenant A CANNOT read tenant B's job (404, not 403, not 200)", async () => {
      const res = await request(app.getHttpServer())
        .get('/insight-ai/jobs/iai:job-of-b')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(404);
    });

    it('legacy/malformed job without tenantId payload is invisible to ALL tenants', async () => {
      const resA = await request(app.getHttpServer())
        .get('/insight-ai/jobs/iai:legacy')
        .set('Authorization', `Bearer ${tenantAToken}`);
      const resB = await request(app.getHttpServer())
        .get('/insight-ai/jobs/iai:legacy')
        .set('Authorization', `Bearer ${tenantBToken}`);
      expect(resA.status).toBe(404);
      expect(resB.status).toBe(404);
    });

    it('non-existent job returns 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/insight-ai/jobs/iai:does-not-exist')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /insight-ai/analyses', () => {
    it('tenant A only sees analyses from tenant A', async () => {
      const res = await request(app.getHttpServer())
        .get('/insight-ai/analyses')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.every((a: any) => a.tenantId === 'tenant-a')).toBe(true);
      expect(res.body.items.find((a: any) => a.tenantId === 'tenant-b')).toBeUndefined();
      expect(res.body.meta.total).toBe(1);
    });

    it('tenant B only sees analyses from tenant B', async () => {
      const res = await request(app.getHttpServer())
        .get('/insight-ai/analyses')
        .set('Authorization', `Bearer ${tenantBToken}`);
      expect(res.status).toBe(200);
      expect(res.body.items.every((a: any) => a.tenantId === 'tenant-b')).toBe(true);
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('GET /insight-ai/dashboard/usage', () => {
    it('tenant A usage aggregates exclude tenant B', async () => {
      const res = await request(app.getHttpServer())
        .get('/insight-ai/dashboard/usage?days=7')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.byProvider).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ modelProvider: 'openai', calls: 1, promptTokens: 100 }),
        ]),
      );
      expect(res.body.byProvider.find((p: any) => p.modelProvider === 'google')).toBeUndefined();
      expect(res.body.rows.every((r: any) => r.modelProvider === 'openai')).toBe(true);
      expect(res.body.meta.total).toBe(1);
    });

    it('tenant B sees only google provider row', async () => {
      const res = await request(app.getHttpServer())
        .get('/insight-ai/dashboard/usage?days=7&status=all')
        .set('Authorization', `Bearer ${tenantBToken}`);
      expect(res.status).toBe(200);
      expect(res.body.byProvider.some((p: any) => p.modelProvider === 'google')).toBe(true);
      expect(res.body.byProvider.find((p: any) => p.modelProvider === 'openai')).toBeUndefined();
    });
  });
});
