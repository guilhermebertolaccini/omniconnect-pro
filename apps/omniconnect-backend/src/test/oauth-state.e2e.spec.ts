/**
 * Sprint 2.4 — Bloco F.
 *
 * E2E OAuth state isolation:
 *  - GET /oauth/:platform/start exige JWT e gera state vinculado ao tenant do
 *    caller (não dá pra "pegar emprestado" um state alheio).
 *  - GET /oauth/:platform/callback recusa states de tenant errado, expirados,
 *    com platform diferente, ou apontando para advertiserCompany de outro
 *    tenant — sempre redirecionando para o frontend com ?status=error.
 *  - A connection só é criada/atualizada quando o state é válido E a company
 *    pertence ao tenant do state.
 *
 * Usa o OAuthService real (encode/decode de state com cifra real), mas injeta
 * um fetch fake para simular as respostas do provider sem rede.
 */

import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { AdPlatform, Role } from '@prisma/client';
import request from 'supertest';

import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { SystemEventsService } from '../system-events/system-events.service';
import { OAuthController } from '../oauth/oauth.controller';
import { OAUTH_FETCH, OAuthService } from '../oauth/oauth.service';

const JWT_SECRET = 'oauth-state-e2e-secret';
const BRIDGE_KEY = Buffer.alloc(32, 7).toString('base64');

function buildInMemoryPrisma() {
  const users = [
    { id: 1, email: 'a@tenant-a.com', name: 'A', role: Role.admin },
    { id: 2, email: 'b@tenant-b.com', name: 'B', role: Role.admin },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
  ];
  const advertiserCompanies = [
    { id: 'ac-a', tenantId: 'tenant-a', name: 'CoA' },
    { id: 'ac-b', tenantId: 'tenant-b', name: 'CoB' },
  ];
  const connections: any[] = [];

  let connSeq = 0;

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
    },
    userTenant: {
      findUnique: async ({ where }: any) => {
        const key = where.userId_tenantId;
        return (
          userTenants.find(
            (ut) => ut.userId === key.userId && ut.tenantId === key.tenantId,
          ) ?? null
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
          }) ?? null
        );
      },
    },
    adPlatformConnection: {
      findUnique: async ({ where }: any) => {
        const k = where.advertiserCompanyId_platform;
        if (!k) return null;
        return (
          connections.find(
            (c) =>
              c.advertiserCompanyId === k.advertiserCompanyId && c.platform === k.platform,
          ) ?? null
        );
      },
      create: async ({ data, select: _select }: any) => {
        const row = { id: `conn-${++connSeq}`, ...data };
        connections.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const idx = connections.findIndex((c) => c.id === where.id);
        if (idx < 0) throw new Error(`connection ${where.id} not found`);
        connections[idx] = { ...connections[idx], ...data };
        return connections[idx];
      },
    },
  };

  return { prisma, connections };
}

function buildFakeFetch(): jest.Mock {
  return jest.fn(async (url: string) => {
    if (url.includes('graph.facebook.com')) {
      return new Response(
        JSON.stringify({
          access_token: 'meta-token',
          expires_in: 3600,
          token_type: 'bearer',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200 });
  });
}

describe('OAuth state isolation (E2E)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let cipher: BridgeSecretCipher;
  let store: ReturnType<typeof buildInMemoryPrisma>;
  let tokenAdminA: string;
  let tokenAdminB: string;
  let fakeFetch: jest.Mock;
  const FRONTEND = 'http://app.local';
  const API = 'http://api.local';

  beforeAll(async () => {
    store = buildInMemoryPrisma();
    fakeFetch = buildFakeFetch();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET,
              BRIDGE_SECRET_KEY: BRIDGE_KEY,
              META_APP_ID: 'meta-client-id',
              META_APP_SECRET: 'meta-client-secret',
              API_URL: API,
              OAUTH_FRONTEND_REDIRECT_BASE: FRONTEND,
            }),
          ],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [OAuthController],
      providers: [
        JwtStrategy,
        ConfigService,
        BridgeSecretCipher,
        OAuthService,
        { provide: PrismaService, useValue: store.prisma },
        {
          provide: SystemEventsService,
          useValue: { logEvent: async () => undefined },
        },
        { provide: OAUTH_FETCH, useValue: fakeFetch },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    jwt = module.get<JwtService>(JwtService);
    cipher = module.get<BridgeSecretCipher>(BridgeSecretCipher);
    tokenAdminA = jwt.sign({ sub: 1, email: 'a@tenant-a.com', role: 'admin', tenantId: 'tenant-a' });
    tokenAdminB = jwt.sign({ sub: 2, email: 'b@tenant-b.com', role: 'admin', tenantId: 'tenant-b' });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ---------------------------------------------------------------------------
  // /oauth/:platform/start
  // ---------------------------------------------------------------------------

  describe('GET /oauth/meta/start', () => {
    it('Sem JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/oauth/meta/start?advertiserCompanyId=ac-a',
      );
      expect(res.status).toBe(401);
    });

    it('Tenant A pode iniciar OAuth para a SUA company', async () => {
      const res = await request(app.getHttpServer())
        .get('/oauth/meta/start?advertiserCompanyId=ac-a&returnUrl=/settings')
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.authorizeUrl).toBe('string');
      expect(res.body.authorizeUrl).toContain('facebook.com');
      expect(typeof res.body.state).toBe('string');
      expect(res.body.state.length).toBeGreaterThan(40);
    });

    it('Tenant A NÃO consegue iniciar OAuth para company de tenant B (404)', async () => {
      const res = await request(app.getHttpServer())
        .get('/oauth/meta/start?advertiserCompanyId=ac-b')
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(404);
    });

    it('Plataforma inválida → 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/oauth/wrong/start?advertiserCompanyId=ac-a')
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // /oauth/:platform/callback — state isolation
  // ---------------------------------------------------------------------------

  describe('GET /oauth/meta/callback', () => {
    function encodeState(payload: {
      tid: string;
      uid: number;
      aci: string;
      plat: AdPlatform;
      n?: string;
      exp?: number;
      ru?: string;
    }): string {
      const full = {
        n: 'nonce-1234567890',
        exp: Date.now() + 5 * 60 * 1000,
        ...payload,
      };
      const cipherText = cipher.encrypt(JSON.stringify(full));
      return Buffer.from(cipherText, 'utf8').toString('base64url');
    }

    it('State válido para tenant A + company A → grava connection e redireciona success', async () => {
      const state = encodeState({
        tid: 'tenant-a',
        uid: 1,
        aci: 'ac-a',
        plat: AdPlatform.meta,
        ru: '/settings',
      });
      const res = await request(app.getHttpServer()).get(
        `/oauth/meta/callback?code=fbcode&state=${encodeURIComponent(state)}`,
      );
      expect(res.status).toBe(302);
      const location = res.headers.location as string;
      expect(location.startsWith(FRONTEND)).toBe(true);
      expect(location).toContain('status=success');
      expect(location).toContain('platform=meta');
      expect(location).toContain('connectionId=');

      // A connection foi gravada para tenant A com a company A
      expect(store.connections).toHaveLength(1);
      expect(store.connections[0].tenantId).toBe('tenant-a');
      expect(store.connections[0].advertiserCompanyId).toBe('ac-a');
      // E os tokens estão cifrados — nunca o plaintext.
      expect(store.connections[0].accessTokenEncrypted).not.toBe('meta-token');
      expect(store.connections[0].accessTokenEncrypted).toMatch(/^v1\./);
    });

    it('State para company de OUTRO tenant (mismatch) → redireciona error e não cria connection', async () => {
      const before = store.connections.length;
      // tid=tenant-a, mas aci=ac-b (company de tenant-b) → company.findFirst
      // filtra por tenantId e devolve null, gerando NotFoundException.
      const state = encodeState({
        tid: 'tenant-a',
        uid: 1,
        aci: 'ac-b',
        plat: AdPlatform.meta,
      });
      const res = await request(app.getHttpServer()).get(
        `/oauth/meta/callback?code=fbcode&state=${encodeURIComponent(state)}`,
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=error');
      expect(store.connections.length).toBe(before);
    });

    it('State expirado → redireciona error', async () => {
      const state = encodeState({
        tid: 'tenant-a',
        uid: 1,
        aci: 'ac-a',
        plat: AdPlatform.meta,
        exp: Date.now() - 1000,
      });
      const before = store.connections.length;
      const res = await request(app.getHttpServer()).get(
        `/oauth/meta/callback?code=fbcode&state=${encodeURIComponent(state)}`,
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=error');
      expect(store.connections.length).toBe(before);
    });

    it('State com plataforma diferente da URL → redireciona error', async () => {
      const state = encodeState({
        tid: 'tenant-a',
        uid: 1,
        aci: 'ac-a',
        plat: AdPlatform.google_ads,
      });
      const before = store.connections.length;
      const res = await request(app.getHttpServer()).get(
        `/oauth/meta/callback?code=fbcode&state=${encodeURIComponent(state)}`,
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=error');
      expect(store.connections.length).toBe(before);
    });

    it('State malformado → redireciona error', async () => {
      const res = await request(app.getHttpServer()).get(
        '/oauth/meta/callback?code=fbcode&state=NOT-A-VALID-STATE',
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=error');
    });

    it('Provider devolve ?error=... → bounce direto sem chamar exchange', async () => {
      const callsBefore = fakeFetch.mock.calls.length;
      const res = await request(app.getHttpServer()).get(
        '/oauth/meta/callback?error=access_denied',
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=error');
      expect(res.headers.location).toContain('access_denied');
      expect(fakeFetch.mock.calls.length).toBe(callsBefore);
    });
  });

  // Sanity check on cross-tenant smuggling: tenant B token NUNCA serve para
  // iniciar OAuth para company A.
  it('Tenant B token + company A → 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/oauth/meta/start?advertiserCompanyId=ac-a')
      .set('Authorization', `Bearer ${tokenAdminB}`);
    expect(res.status).toBe(404);
  });
});
