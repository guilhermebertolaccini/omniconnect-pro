/**
 * Smart Ad Automator (SAA) — tenant isolation E2E.
 *
 * Boots a NestJS HTTP app with the three SAA controllers
 * (AdPlatformConnections, AdvertiserCompanies, AdCampaignsAi) wired
 * against the real JwtAuthGuard + JwtStrategy + RolesGuard, and a Prisma
 * mock that enforces `where.tenantId` exactly like Postgres would.
 *
 * Goal: prove via real HTTP requests that a JWT issued for tenant A
 * cannot read, mutate, or decrypt resources belonging to tenant B —
 * for every SAA surface introduced in Sprint 2.3.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AdPlatform } from '@prisma/client';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { AdPlatformConnectionsController } from '../ad-platform-connections/ad-platform-connections.controller';
import { AdPlatformConnectionsService } from '../ad-platform-connections/ad-platform-connections.service';
import { AdvertiserCompaniesController } from '../advertiser-companies/advertiser-companies.controller';
import { AdvertiserCompaniesService } from '../advertiser-companies/advertiser-companies.service';
import {
  AdPlatformProxyService,
  PLATFORM_PROXY_FETCH,
} from '../advertiser-companies/ad-platform-proxy.service';
import { SystemEventsService } from '../system-events/system-events.service';
import { AdCampaignsAiController } from '../ad-campaigns-ai/ad-campaigns-ai.controller';
import { AdCampaignsAiService } from '../ad-campaigns-ai/ad-campaigns-ai.service';

const JWT_SECRET = 'saa-tenant-isolation-e2e-secret';

function buildInMemoryPrisma() {
  const users = [
    { id: 1, email: 'a@tenant-a.com', name: 'A', role: 'admin' as const },
    { id: 2, email: 'b@tenant-b.com', name: 'B', role: 'admin' as const },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: 'admin' as const },
    { userId: 2, tenantId: 'tenant-b', role: 'admin' as const },
  ];
  const advertiserCompanies = [
    { id: 'ac-a', tenantId: 'tenant-a', name: 'CoA', businessName: 'A Ltd' },
    { id: 'ac-b', tenantId: 'tenant-b', name: 'CoB', businessName: 'B Ltd' },
  ];
  const adPlatformConnections = [
    {
      id: 'conn-a',
      tenantId: 'tenant-a',
      advertiserCompanyId: 'ac-a',
      platform: AdPlatform.meta,
      accountId: 'act_a',
      accessTokenEncrypted: 'enc:token-a',
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      isActive: true,
      extra: null,
      createdById: 1,
      createdAt: new Date('2026-05-18T10:00:00Z'),
      updatedAt: new Date('2026-05-18T10:00:00Z'),
    },
    {
      id: 'conn-b',
      tenantId: 'tenant-b',
      advertiserCompanyId: 'ac-b',
      platform: AdPlatform.meta,
      accountId: 'act_b',
      accessTokenEncrypted: 'enc:token-b',
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      isActive: true,
      extra: null,
      createdById: 2,
      createdAt: new Date('2026-05-18T10:00:00Z'),
      updatedAt: new Date('2026-05-18T10:00:00Z'),
    },
  ];
  const adCampaignAIAnalyses = [
    {
      id: 'an-a',
      tenantId: 'tenant-a',
      advertiserCompanyId: 'ac-a',
      platform: AdPlatform.meta,
      campaignId: 'cmp-a',
      campaignName: 'Campaign A',
      analysis: { healthScore: 80 },
      modelProvider: 'openai',
      modelName: 'gpt-4o-mini',
      promptVersion: 'v1',
      generatedById: 1,
      createdAt: new Date('2026-05-18T10:00:00Z'),
    },
    {
      id: 'an-b',
      tenantId: 'tenant-b',
      advertiserCompanyId: 'ac-b',
      platform: AdPlatform.meta,
      campaignId: 'cmp-b',
      campaignName: 'Campaign B',
      analysis: { healthScore: 60 },
      modelProvider: 'openai',
      modelName: 'gpt-4o-mini',
      promptVersion: 'v1',
      generatedById: 2,
      createdAt: new Date('2026-05-18T10:00:00Z'),
    },
  ];

  const prisma: any = {
    user: {
      findUnique: async ({ where: { id } }: any) => users.find((u) => u.id === id) || null,
    },
    userTenant: {
      findUnique: async ({ where }: any) => {
        const key = where.userId_tenantId;
        if (!key) return null;
        return (
          userTenants.find((ut) => ut.userId === key.userId && ut.tenantId === key.tenantId) ||
          null
        );
      },
    },
    advertiserCompany: {
      findFirst: async ({ where }: any) => {
        return (
          advertiserCompanies.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.tenantId && c.tenantId !== where.tenantId) return false;
            return true;
          }) || null
        );
      },
      findMany: async ({ where }: any) => {
        return advertiserCompanies.filter((c) => {
          if (where.tenantId && c.tenantId !== where.tenantId) return false;
          return true;
        });
      },
    },
    adPlatformConnection: {
      findFirst: async ({ where }: any) => {
        return (
          adPlatformConnections.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.tenantId && c.tenantId !== where.tenantId) return false;
            return true;
          }) || null
        );
      },
      findMany: async ({ where }: any) => {
        return adPlatformConnections.filter((c) => {
          if (where.tenantId && c.tenantId !== where.tenantId) return false;
          if (where.advertiserCompanyId && c.advertiserCompanyId !== where.advertiserCompanyId) return false;
          return true;
        });
      },
      findUnique: async ({ where }: any) => {
        if (where.advertiserCompanyId_platform) {
          const { advertiserCompanyId, platform } = where.advertiserCompanyId_platform;
          return (
            adPlatformConnections.find(
              (c) => c.advertiserCompanyId === advertiserCompanyId && c.platform === platform,
            ) || null
          );
        }
        return null;
      },
    },
    adCampaignAIAnalysis: {
      findFirst: async ({ where }: any) => {
        return (
          adCampaignAIAnalyses.find((a) => {
            if (where.id && a.id !== where.id) return false;
            if (where.tenantId && a.tenantId !== where.tenantId) return false;
            return true;
          }) || null
        );
      },
      findMany: async ({ where }: any) => {
        return adCampaignAIAnalyses.filter((a) => {
          if (where.tenantId && a.tenantId !== where.tenantId) return false;
          if (where.advertiserCompanyId && a.advertiserCompanyId !== where.advertiserCompanyId) return false;
          return true;
        });
      },
    },
  };
  return prisma;
}

describe('SAA tenant isolation (E2E)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let tenantAToken: string;
  let tenantBToken: string;
  // Cross-tenant smuggling: tenant A user trying to claim tenant B via jwt body
  let smuggledTokenAtoB: string;

  beforeAll(async () => {
    const prisma = buildInMemoryPrisma();

    const adCampaignsAiStub: Partial<AdCampaignsAiService> = {
      findAnalyses: ((tenantId: string, filters: any) =>
        prisma.adCampaignAIAnalysis.findMany({ where: { tenantId, ...filters } })) as any,
      findAnalysis: (async (tenantId: string, id: string) => {
        const row = await prisma.adCampaignAIAnalysis.findFirst({ where: { id, tenantId } });
        if (!row) {
          // Use the same NotFoundException semantics as the real service
          const { NotFoundException } = await import('@nestjs/common');
          throw new NotFoundException('Ad campaign analysis not found for this tenant');
        }
        return row;
      }) as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET, BRIDGE_SECRET_KEY: 'dev-bridge-key' })],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [
        AdPlatformConnectionsController,
        AdvertiserCompaniesController,
        AdCampaignsAiController,
      ],
      providers: [
        JwtStrategy,
        ConfigService,
        BridgeSecretCipher,
        AdPlatformConnectionsService,
        AdvertiserCompaniesService,
        AdPlatformProxyService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SystemEventsService,
          useValue: { logEvent: async () => undefined },
        },
        { provide: PLATFORM_PROXY_FETCH, useValue: jest.fn() },
        { provide: AdCampaignsAiService, useValue: adCampaignsAiStub },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwt = module.get<JwtService>(JwtService);
    tenantAToken = jwt.sign({ sub: 1, email: 'a@tenant-a.com', role: 'admin', tenantId: 'tenant-a' });
    tenantBToken = jwt.sign({ sub: 2, email: 'b@tenant-b.com', role: 'admin', tenantId: 'tenant-b' });
    smuggledTokenAtoB = jwt.sign({ sub: 1, email: 'a@tenant-a.com', role: 'admin', tenantId: 'tenant-b' });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ----- AdPlatformConnections -----

  describe('GET /ad-platform-connections', () => {
    it('Tenant A only sees its own connections', async () => {
      const res = await request(app.getHttpServer())
        .get('/ad-platform-connections')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].tenantId).toBe('tenant-a');
      // Token never leaks via list endpoint
      expect(res.body[0].accessTokenEncrypted).toBeUndefined();
      expect(res.body[0].hasAccessToken).toBe(true);
      expect(res.body[0].accessTokenHint).toBeNull();
    });

    it('Tenant B only sees its own connections', async () => {
      const res = await request(app.getHttpServer())
        .get('/ad-platform-connections')
        .set('Authorization', `Bearer ${tenantBToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].tenantId).toBe('tenant-b');
    });
  });

  describe('GET /ad-platform-connections/:id', () => {
    it('Tenant A can read its own connection', async () => {
      const res = await request(app.getHttpServer())
        .get('/ad-platform-connections/conn-a')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('conn-a');
    });

    it("Tenant A CANNOT read Tenant B's connection (404)", async () => {
      const res = await request(app.getHttpServer())
        .get('/ad-platform-connections/conn-b')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /ad-platform-connections/:id/test', () => {
    it("Tenant A CANNOT test Tenant B's connection", async () => {
      const res = await request(app.getHttpServer())
        .post('/ad-platform-connections/conn-b/test')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ----- AdvertiserCompanies -----

  describe('GET /advertiser-companies/:id', () => {
    it("Tenant A CANNOT read Tenant B's advertiser company (404)", async () => {
      const res = await request(app.getHttpServer())
        .get('/advertiser-companies/ac-b')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(404);
    });

    it('Tenant A reads its own', async () => {
      const res = await request(app.getHttpServer())
        .get('/advertiser-companies/ac-a')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('tenant-a');
    });
  });

  describe('POST /advertiser-companies/:id/platforms/:platform/proxy', () => {
    it("Tenant A CANNOT proxy through Tenant B's connection (404 on company lookup)", async () => {
      const res = await request(app.getHttpServer())
        .post('/advertiser-companies/ac-b/platforms/meta/proxy')
        .set('Authorization', `Bearer ${tenantAToken}`)
        .send({ endpoint: '/me' });
      expect(res.status).toBe(404);
    });

    it('rejects absolute URLs even for own tenant (SSRF defense)', async () => {
      const res = await request(app.getHttpServer())
        .post('/advertiser-companies/ac-a/platforms/meta/proxy')
        .set('Authorization', `Bearer ${tenantAToken}`)
        .send({ endpoint: 'https://evil.example/x' });
      expect(res.status).toBe(400);
    });
  });

  // ----- AdCampaignAIAnalyses -----

  describe('GET /ad-campaigns-ai/analyses', () => {
    it('Tenant A only sees its own AI analyses', async () => {
      const res = await request(app.getHttpServer())
        .get('/ad-campaigns-ai/analyses')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.every((a: any) => a.tenantId === 'tenant-a')).toBe(true);
    });

    it("Tenant A CANNOT read Tenant B's analysis (404)", async () => {
      const res = await request(app.getHttpServer())
        .get('/ad-campaigns-ai/analyses/an-b')
        .set('Authorization', `Bearer ${tenantAToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ----- JWT smuggling -----

  describe('JWT smuggling defense', () => {
    it('A JWT claiming tenant-b but issued for user 1 is rejected in production', async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await request(app.getHttpServer())
          .get('/ad-platform-connections')
          .set('Authorization', `Bearer ${smuggledTokenAtoB}`);
        expect(res.status).toBe(401);
      } finally {
        process.env.NODE_ENV = prev;
      }
    });
  });
});
