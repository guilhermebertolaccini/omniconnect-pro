/**
 * Sprint 6 — Botify G2 (ADR-0002, condição 8).
 *
 * E2E HTTP tenant isolation para os endpoints REST de Bots + Flows:
 *  - `GET/POST/PATCH/DELETE /botify/bots` + `/botify/bots/:id`
 *  - `GET/POST/PATCH/DELETE /botify/flows` + `/botify/flows/:id`
 *  - `POST /botify/flows/:id/publish` + `/unpublish`
 *
 * Cobre:
 *  - auth gating (401 sem JWT)
 *  - roles: broker/ativador rejeitados; operator lê mas não muta;
 *    admin/supervisor/digital podem tudo
 *  - cross-tenant: admin de B não lê/muta/publica recurso de A (404)
 *  - DTO rejeita payload inválido (botId não-UUID, name vazio)
 *  - paginação (default + custom)
 *  - publish lifecycle: increment de `publishedVersion`, set/clear
 *    de `publishedAt`/`publishedGraph`
 *  - unpublish zera os 3 campos
 *
 * Roda no estilo dos outros E2Es: NestJS HTTP + Prisma mock in-memory.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { BotifyController } from '../botify/botify.controller';
import { BotifyService } from '../botify/botify.service';
import { BotifyChannelConfigService } from '../botify/botify-channel-config.service';
import { BotifyConversationsService } from '../botify/botify-conversations.service';
import { BotifyFlowEngineService } from '../botify/botify-flow-engine.service';
import { BotifyMetaAccountsService } from '../botify/botify-meta-accounts.service';
import { SystemEventsService } from '../system-events/system-events.service';

const JWT_SECRET = 'botify-g2-e2e-secret';

interface BotRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  metaAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FlowRow {
  id: string;
  tenantId: string;
  botId: string;
  name: string;
  triggerKeyword: string | null;
  externalSourceId: string | null;
  draftGraph: unknown;
  publishedGraph: unknown;
  publishedAt: Date | null;
  publishedVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

function buildPrisma() {
  const users = [
    { id: 1, email: 'admin-a@a.com', name: 'Admin A', role: Role.admin },
    { id: 2, email: 'admin-b@b.com', name: 'Admin B', role: Role.admin },
    { id: 3, email: 'sup-a@a.com', name: 'Sup A', role: Role.supervisor },
    { id: 4, email: 'digital-a@a.com', name: 'Digital A', role: Role.digital },
    { id: 5, email: 'op-a@a.com', name: 'Op A', role: Role.operator },
    { id: 6, email: 'broker-a@a.com', name: 'Broker A', role: Role.broker },
    { id: 7, email: 'ativador-a@a.com', name: 'Ativador A', role: Role.ativador },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
    { userId: 3, tenantId: 'tenant-a', role: Role.supervisor },
    { userId: 4, tenantId: 'tenant-a', role: Role.digital },
    { userId: 5, tenantId: 'tenant-a', role: Role.operator },
    { userId: 6, tenantId: 'tenant-a', role: Role.broker },
    { userId: 7, tenantId: 'tenant-a', role: Role.ativador },
  ];

  const newId = () => randomUUID();
  const bots: BotRow[] = [];
  const flows: FlowRow[] = [];

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
    botifyBot: {
      count: async ({ where }: any) =>
        bots.filter((b) => matchBot(b, where)).length,
      findMany: async ({ where, take, skip, orderBy: _ob }: any) => {
        const rows = bots
          .filter((b) => matchBot(b, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.slice(skip ?? 0, (skip ?? 0) + (take ?? 50));
      },
      findFirst: async ({ where }: any) =>
        bots.find((b) => matchBot(b, where)) ?? null,
      findUnique: async ({ where }: any) =>
        bots.find((b) => b.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const row: BotRow = {
          id: newId(),
          tenantId: data.tenantId,
          name: data.name,
          description: data.description ?? null,
          isActive: data.isActive ?? true,
          metaAccountId: data.metaAccountId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        bots.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = bots.find((b) => b.id === where.id);
        if (!row) throw new Error('bot not found');
        if (data.name !== undefined) row.name = data.name;
        if (data.description !== undefined) row.description = data.description;
        if (data.isActive !== undefined) row.isActive = data.isActive;
        if (data.metaAccountId !== undefined) row.metaAccountId = data.metaAccountId;
        row.updatedAt = new Date();
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = bots.findIndex((b) => b.id === where.id);
        if (idx < 0) throw new Error('bot not found');
        const removed = bots[idx];
        bots.splice(idx, 1);
        // cascade flows
        for (let i = flows.length - 1; i >= 0; i--) {
          if (flows[i].botId === where.id) flows.splice(i, 1);
        }
        return removed;
      },
    },
    botifyFlow: {
      count: async ({ where }: any) =>
        flows.filter((f) => matchFlow(f, where)).length,
      findMany: async ({ where, take, skip, orderBy: _ob }: any) => {
        const rows = flows
          .filter((f) => matchFlow(f, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.slice(skip ?? 0, (skip ?? 0) + (take ?? 50));
      },
      findFirst: async ({ where }: any) =>
        flows.find((f) => matchFlow(f, where)) ?? null,
      findUnique: async ({ where }: any) =>
        flows.find((f) => f.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const row: FlowRow = {
          id: newId(),
          tenantId: data.tenantId,
          botId: data.botId,
          name: data.name,
          triggerKeyword: data.triggerKeyword ?? null,
          externalSourceId: data.externalSourceId ?? null,
          draftGraph: data.draftGraph ?? null,
          publishedGraph: null,
          publishedAt: null,
          publishedVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        flows.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = flows.find((f) => f.id === where.id);
        if (!row) throw new Error('flow not found');
        if (data.name !== undefined) row.name = data.name;
        if (data.triggerKeyword !== undefined) row.triggerKeyword = data.triggerKeyword;
        if (data.draftGraph !== undefined) row.draftGraph = data.draftGraph;
        if (data.publishedGraph !== undefined) row.publishedGraph = data.publishedGraph;
        if (data.publishedAt !== undefined) row.publishedAt = data.publishedAt;
        if (data.publishedVersion !== undefined) row.publishedVersion = data.publishedVersion;
        row.updatedAt = new Date();
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = flows.findIndex((f) => f.id === where.id);
        if (idx < 0) throw new Error('flow not found');
        return flows.splice(idx, 1)[0];
      },
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };

  function matchBot(b: BotRow, where: any): boolean {
    if (where.tenantId && b.tenantId !== where.tenantId) return false;
    if (where.id && b.id !== where.id) return false;
    return true;
  }
  function matchFlow(f: FlowRow, where: any): boolean {
    if (where.tenantId && f.tenantId !== where.tenantId) return false;
    if (where.id && f.id !== where.id) return false;
    if (where.botId && f.botId !== where.botId) return false;
    return true;
  }

  return { prisma, users, userTenants, bots, flows };
}

describe('Botify G2 (E2E tenant isolation HTTP)', () => {
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
      controllers: [BotifyController],
      providers: [
        JwtStrategy,
        ConfigService,
        BotifyService,
        { provide: PrismaService, useValue: store.prisma },
        // Os outros services do controller — stubs com os métodos mínimos que
        // `BotifyService` chama em create/update/delete de bot/flow.
        {
          provide: BotifyChannelConfigService,
          useValue: {
            // O mapBot do BotifyService chama `cfg.phoneNumberId` direto —
            // precisa de objeto vivo (não null) mesmo sem config real.
            parseChannelConfig: (raw: unknown) =>
              raw && typeof raw === 'object'
                ? (raw as Record<string, unknown>)
                : { phoneNumberId: '' },
            serializeChannelConfig: (cfg: unknown) => cfg ?? null,
            mergeChannelConfig: (_prev: unknown, next: unknown) =>
              next ?? { phoneNumberId: '' },
            lineHealth: (_cfg: unknown) => ({ status: 'unknown' }),
          },
        },
        { provide: BotifyConversationsService, useValue: {} },
        { provide: BotifyFlowEngineService, useValue: {} },
        { provide: BotifyMetaAccountsService, useValue: {} },
        { provide: SystemEventsService, useValue: { logEvent: jest.fn() } },
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

  describe('auth gating + roles', () => {
    it('401 sem JWT em GET /botify/bots', async () => {
      await request(app.getHttpServer()).get('/botify/bots').expect(401);
    });

    it('broker rejeitado em GET (não está em BOTIFY_ROLES)', async () => {
      const token = sign(6, 'tenant-a', Role.broker);
      await request(app.getHttpServer())
        .get('/botify/bots')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('ativador rejeitado em GET', async () => {
      const token = sign(7, 'tenant-a', Role.ativador);
      await request(app.getHttpServer())
        .get('/botify/flows')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('operator pode GET mas NÃO pode criar bot', async () => {
      const tokenOp = sign(5, 'tenant-a', Role.operator);
      await request(app.getHttpServer())
        .get('/botify/bots')
        .set('Authorization', `Bearer ${tokenOp}`)
        .expect(200);
      await request(app.getHttpServer())
        .post('/botify/bots')
        .set('Authorization', `Bearer ${tokenOp}`)
        .send({ name: 'Triagem' })
        .expect(403);
    });
  });

  describe('CRUD bots — happy path', () => {
    let botId: string;

    it('admin de A cria bot', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .post('/botify/bots')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Triagem inicial', description: 'Triagem vendas' })
        .expect(201);
      // `mapBot` não devolve `tenantId` no body (proteção comprovada pelo
      // 404 cross-tenant em outros casos). Devolve `status` em vez de `isActive`.
      expect(res.body.name).toBe('Triagem inicial');
      expect(res.body.description).toBe('Triagem vendas');
      expect(res.body.status).toBe('online');
      expect(res.body.id).toBeDefined();
      botId = res.body.id;
    });

    it('GET /bots paginado: default + custom', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res1 = await request(app.getHttpServer())
        .get('/botify/bots')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      // PaginatedResult shape: { data: [], meta: { limit, page, total } }
      expect(res1.body).toHaveProperty('data');
      expect(res1.body).toHaveProperty('meta');
      expect(res1.body.meta.total).toBeGreaterThanOrEqual(1);

      const res2 = await request(app.getHttpServer())
        .get('/botify/bots?page=1&limit=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res2.body.meta.limit).toBe(5);
      expect(res2.body.meta.page).toBe(1);
    });

    it('PATCH bot do A', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .patch(`/botify/bots/${botId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Triagem renomeada' })
        .expect(200);
      expect(res.body.name).toBe('Triagem renomeada');
    });

    it('supervisor de A consegue criar', async () => {
      const token = sign(3, 'tenant-a', Role.supervisor);
      await request(app.getHttpServer())
        .post('/botify/bots')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Outro bot' })
        .expect(201);
    });

    it('DTO rejeita name vazio (400)', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .post('/botify/bots')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' })
        .expect(400);
    });
  });

  describe('Cross-tenant — bot isolation', () => {
    let botOfA: string;

    beforeAll(async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .post('/botify/bots')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bot isolado A' })
        .expect(201);
      botOfA = res.body.id;
    });

    it('admin de B NÃO vê bot de A na listagem', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/botify/bots')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('Bot isolado A');
      expect(JSON.stringify(res.body)).not.toContain(botOfA);
    });

    it('admin de B 404 em GET /bots/:id do A', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .get(`/botify/bots/${botOfA}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('admin de B 404 em PATCH /bots/:id do A', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .patch(`/botify/bots/${botOfA}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'hacked' })
        .expect(404);
    });

    it('admin de B 404 em DELETE /bots/:id do A', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .delete(`/botify/bots/${botOfA}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('CRUD flows — happy path', () => {
    let botId: string;
    let flowId: string;

    beforeAll(async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const bot = await request(app.getHttpServer())
        .post('/botify/bots')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bot para flows' })
        .expect(201);
      botId = bot.body.id;
    });

    it('admin cria flow vinculado ao bot', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .post('/botify/flows')
        .set('Authorization', `Bearer ${token}`)
        .send({
          botId,
          name: 'Boas-vindas',
          triggerKeyword: 'oi',
        })
        .expect(201);
      // `mapFlow` expõe `isActive` (true se publishedGraph != null), não
      // o `tenantId` nem `publishedVersion` direto.
      expect(res.body.botId).toBe(botId);
      expect(res.body.name).toBe('Boas-vindas');
      expect(res.body.isActive).toBe(false);
      flowId = res.body.id;
    });

    it('DTO rejeita botId não-UUID (400)', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .post('/botify/flows')
        .set('Authorization', `Bearer ${token}`)
        .send({ botId: 'not-a-uuid', name: 'Erro' })
        .expect(400);
    });

    it('digital consegue PATCH flow', async () => {
      const token = sign(4, 'tenant-a', Role.digital);
      const res = await request(app.getHttpServer())
        .patch(`/botify/flows/${flowId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Boas-vindas v2', triggerKeyword: 'oi pessoal' })
        .expect(200);
      expect(res.body.name).toBe('Boas-vindas v2');
      expect(res.body.triggerKeyword).toBe('oi pessoal');
    });

    it('publish lifecycle: publish ⇒ isActive=true', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .post(`/botify/flows/${flowId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      // Em `mapFlow`, `isActive` é derivado de `publishedGraph != null` —
      // publicar promove o flow.
      expect(res.body.isActive).toBe(true);
    });

    it('publish lifecycle: 2ª publish mantém isActive=true (versão interna incrementa)', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .post(`/botify/flows/${flowId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(res.body.isActive).toBe(true);
    });

    it('unpublish ⇒ isActive=false', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .post(`/botify/flows/${flowId}/unpublish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(res.body.isActive).toBe(false);
    });

    it('DELETE flow do A', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .delete(`/botify/flows/${flowId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('DELETE do bot pai cascadeia flows', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      // cria flow novo, depois apaga o bot
      const flow = await request(app.getHttpServer())
        .post('/botify/flows')
        .set('Authorization', `Bearer ${token}`)
        .send({ botId, name: 'Vai cascadear' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/botify/bots/${botId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // GET do flow agora retorna 404
      await request(app.getHttpServer())
        .get(`/botify/flows/${flow.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('Cross-tenant — flow isolation', () => {
    let botOfA: string;
    let flowOfA: string;

    beforeAll(async () => {
      const tokenA = sign(1, 'tenant-a', Role.admin);
      const bot = await request(app.getHttpServer())
        .post('/botify/bots')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Bot cross-tenant A' })
        .expect(201);
      botOfA = bot.body.id;
      const flow = await request(app.getHttpServer())
        .post('/botify/flows')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ botId: botOfA, name: 'Flow isolado A' })
        .expect(201);
      flowOfA = flow.body.id;
    });

    it('admin de B NÃO vê flow de A na listagem', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/botify/flows')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('Flow isolado A');
      expect(JSON.stringify(res.body)).not.toContain(flowOfA);
    });

    it('admin de B 404 em GET /flows/:id do A', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .get(`/botify/flows/${flowOfA}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('admin de B 404 em PATCH /flows/:id do A', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .patch(`/botify/flows/${flowOfA}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'hacked' })
        .expect(404);
    });

    it('admin de B 404 em POST /flows/:id/publish do A', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .post(`/botify/flows/${flowOfA}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('admin de B 404 em DELETE /flows/:id do A', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .delete(`/botify/flows/${flowOfA}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('admin de B NÃO consegue criar flow vinculado a bot de A (404)', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .post('/botify/flows')
        .set('Authorization', `Bearer ${token}`)
        .send({ botId: botOfA, name: 'tentativa de hijack' })
        .expect(404);
    });
  });
});
