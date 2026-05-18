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

const JWT_SECRET = 'iai-isolation-e2e-secret';

interface AnalysisRow {
  id: number;
  tenantId: string;
  contactPhone: string;
  createdAt: Date;
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
  const analyses: AnalysisRow[] = [
    { id: 10, tenantId: 'tenant-a', contactPhone: '5511999990001', createdAt: new Date() },
    { id: 20, tenantId: 'tenant-b', contactPhone: '5511999990002', createdAt: new Date() },
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
      findMany: async ({ where }: any) => {
        const out = analyses.filter((a) => !where?.tenantId || a.tenantId === where.tenantId);
        if (where?.contactPhone) {
          return out.filter((a) => a.contactPhone === where.contactPhone);
        }
        return out;
      },
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
        { provide: getQueueToken('insight-ai'), useValue: queue },
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
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.every((a: any) => a.tenantId === 'tenant-a')).toBe(true);
      expect(res.body.find((a: any) => a.tenantId === 'tenant-b')).toBeUndefined();
    });

    it('tenant B only sees analyses from tenant B', async () => {
      const res = await request(app.getHttpServer())
        .get('/insight-ai/analyses')
        .set('Authorization', `Bearer ${tenantBToken}`);
      expect(res.status).toBe(200);
      expect(res.body.every((a: any) => a.tenantId === 'tenant-b')).toBe(true);
    });
  });
});
