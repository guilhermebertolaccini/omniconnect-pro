/**
 * Sprint 6 — Botify G6 (ADR-0002, condição 10).
 *
 * E2E HTTP do importador idempotente WP → Omni:
 *   `POST /botify/import/wordpress` (DTO `ImportWordpressSnapshotDto`,
 *   roles `[admin, supervisor, digital]`).
 *
 * Cobre:
 *   - auth gating (401 sem JWT) + role gating (operator/broker/ativador 403)
 *   - happy path: bots[] + flows[] → upsert; retorna `{botsUpserted, flowsUpserted}`
 *   - **idempotência** (a alma do G6): segundo POST com mesma chave
 *     `externalSourceId` não cria duplicatas — upsert por
 *     `@@unique([tenantId, externalSourceId])`. Editar o `name` aplica
 *     na 2ª chamada (mesmo `externalSourceId`).
 *   - DTO inválido: 400 quando `bots[]` vazio (BadRequestException no service)
 *   - 400 quando `flow.botExternalSourceId` aponta pra bot não importado
 *     no mesmo payload
 *   - cross-tenant: admin de B importando `externalSourceId` que A já usou
 *     cria um bot **separado** escopado a B (o unique é per-tenant)
 *   - audit: `SystemEventsService.logEvent(BOTIFY_IMPORT_RUN, BOTIFY, ...)`
 *     é chamado uma vez por import bem-sucedido
 *
 * Mesmo estilo dos E2Es G2/G3: Prisma mock in-memory + Nest TestingModule.
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
import { BotifyAIChatService } from '../botify/botify-ai-chat.service';
import { BotifyChannelConfigService } from '../botify/botify-channel-config.service';
import { BotifyConversationsService } from '../botify/botify-conversations.service';
import { BotifyFlowEngineService } from '../botify/botify-flow-engine.service';
import { BotifyMetaAccountsService } from '../botify/botify-meta-accounts.service';
import { IntegrationBridgeEmitService } from '../integration-bridge-emit/integration-bridge-emit.service';
import {
  EventModule,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';

const JWT_SECRET = 'botify-g6-e2e-secret';

interface BotRow {
  id: string;
  tenantId: string;
  externalSourceId: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface FlowRow {
  id: string;
  tenantId: string;
  botId: string;
  externalSourceId: string | null;
  name: string;
  triggerKeyword: string | null;
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
    { id: 4, email: 'op-a@a.com', name: 'Op A', role: Role.operator },
    { id: 5, email: 'broker-a@a.com', name: 'Broker A', role: Role.broker },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
    { userId: 3, tenantId: 'tenant-a', role: Role.supervisor },
    { userId: 4, tenantId: 'tenant-a', role: Role.operator },
    { userId: 5, tenantId: 'tenant-a', role: Role.broker },
  ];

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
      upsert: async ({ where, create, update }: any) => {
        const key = where.tenantId_externalSourceId;
        const existing = bots.find(
          (b) =>
            b.tenantId === key.tenantId &&
            b.externalSourceId === key.externalSourceId,
        );
        if (existing) {
          if (update.name !== undefined) existing.name = update.name;
          if (update.description !== undefined)
            existing.description = update.description;
          existing.updatedAt = new Date();
          return existing;
        }
        const row: BotRow = {
          id: randomUUID(),
          tenantId: create.tenantId,
          externalSourceId: create.externalSourceId ?? null,
          name: create.name,
          description: create.description ?? null,
          isActive: create.isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        bots.push(row);
        return row;
      },
    },
    botifyFlow: {
      upsert: async ({ where, create, update }: any) => {
        const key = where.tenantId_externalSourceId;
        const existing = flows.find(
          (f) =>
            f.tenantId === key.tenantId &&
            f.externalSourceId === key.externalSourceId,
        );
        if (existing) {
          if (update.name !== undefined) existing.name = update.name;
          if (update.botId !== undefined) existing.botId = update.botId;
          if (update.triggerKeyword !== undefined)
            existing.triggerKeyword = update.triggerKeyword;
          if (update.draftGraph !== undefined)
            existing.draftGraph = update.draftGraph;
          existing.updatedAt = new Date();
          return existing;
        }
        const row: FlowRow = {
          id: randomUUID(),
          tenantId: create.tenantId,
          botId: create.botId,
          externalSourceId: create.externalSourceId ?? null,
          name: create.name,
          triggerKeyword: create.triggerKeyword ?? null,
          draftGraph: create.draftGraph ?? null,
          publishedGraph: null,
          publishedAt: null,
          publishedVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        flows.push(row);
        return row;
      },
    },
  };

  return { prisma, users, bots, flows };
}

describe('Botify G6 — Importador WP → Omni (E2E HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let store: ReturnType<typeof buildPrisma>;
  const logEvent = jest.fn();

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
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [BotifyController],
      providers: [
        JwtStrategy,
        ConfigService,
        BotifyService,
        { provide: PrismaService, useValue: store.prisma },
        {
          provide: BotifyChannelConfigService,
          useValue: {
            parseChannelConfig: (raw: unknown) =>
              raw && typeof raw === 'object'
                ? (raw as Record<string, unknown>)
                : { phoneNumberId: '' },
            serializeChannelConfig: (cfg: unknown) => cfg ?? null,
            mergeChannelConfig: (_p: unknown, n: unknown) =>
              n ?? { phoneNumberId: '' },
            lineHealth: () => ({ status: 'unknown' }),
          },
        },
        { provide: BotifyConversationsService, useValue: {} },
        { provide: BotifyFlowEngineService, useValue: {} },
        { provide: BotifyMetaAccountsService, useValue: {} },
        { provide: BotifyAIChatService, useValue: {} },
        { provide: IntegrationBridgeEmitService, useValue: {} },
        { provide: SystemEventsService, useValue: { logEvent } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logEvent.mockClear();
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

  const sampleSnapshot = () => ({
    bots: [
      {
        externalSourceId: 'wp:bot:101',
        name: 'Triagem WP',
        description: 'imported from WP',
      },
    ],
    flows: [
      {
        externalSourceId: 'wp:flow:201',
        botExternalSourceId: 'wp:bot:101',
        name: 'Boas-vindas WP',
        triggerKeyword: 'oi',
        nodes: [
          { id: 'n1', type: 'start', connections: [{ target: 'n2' }] },
          {
            id: 'n2',
            type: 'message',
            data: { content: 'Olá WP!' },
            connections: [],
          },
        ],
      },
    ],
  });

  describe('auth + roles', () => {
    it('401 sem JWT', async () => {
      await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .send(sampleSnapshot())
        .expect(401);
    });

    it('operator 403 (não está em [admin, supervisor, digital])', async () => {
      const token = sign(4, 'tenant-a', Role.operator);
      await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleSnapshot())
        .expect(403);
    });

    it('broker 403', async () => {
      const token = sign(5, 'tenant-a', Role.broker);
      await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleSnapshot())
        .expect(403);
    });

    it('supervisor consegue importar', async () => {
      const token = sign(3, 'tenant-a', Role.supervisor);
      const res = await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bots: [{ externalSourceId: 'wp:sup:1', name: 'Sup bot' }],
          flows: [],
        })
        .expect(201);
      expect(res.body.botsUpserted).toBe(1);
      expect(res.body.flowsUpserted).toBe(0);
    });
  });

  describe('happy path + idempotência', () => {
    const token = () => sign(1, 'tenant-a', Role.admin);

    it('1ª chamada cria 1 bot + 1 flow', async () => {
      const before = { b: store.bots.length, f: store.flows.length };
      const res = await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token()}`)
        .send(sampleSnapshot())
        .expect(201);
      expect(res.body).toEqual({ botsUpserted: 1, flowsUpserted: 1 });
      expect(store.bots.length).toBe(before.b + 1);
      expect(store.flows.length).toBe(before.f + 1);
    });

    it('2ª chamada idêntica é idempotente (mesma contagem total)', async () => {
      const before = { b: store.bots.length, f: store.flows.length };
      await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token()}`)
        .send(sampleSnapshot())
        .expect(201);
      // sem novos rows físicos
      expect(store.bots.length).toBe(before.b);
      expect(store.flows.length).toBe(before.f);
    });

    it('mudar `name` no payload aplica via update', async () => {
      const snapshot = sampleSnapshot();
      snapshot.bots[0].name = 'Triagem WP v2';
      snapshot.flows[0].name = 'Boas-vindas v2';
      await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token()}`)
        .send(snapshot)
        .expect(201);
      const bot = store.bots.find(
        (b) => b.externalSourceId === 'wp:bot:101' && b.tenantId === 'tenant-a',
      )!;
      expect(bot.name).toBe('Triagem WP v2');
      const flow = store.flows.find(
        (f) => f.externalSourceId === 'wp:flow:201' && f.tenantId === 'tenant-a',
      )!;
      expect(flow.name).toBe('Boas-vindas v2');
    });

    it('audit log: SystemEventsService.logEvent é chamado com BOTIFY_IMPORT_RUN', async () => {
      await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token()}`)
        .send(sampleSnapshot())
        .expect(201);
      expect(logEvent).toHaveBeenCalledWith(
        EventType.BOTIFY_IMPORT_RUN,
        EventModule.BOTIFY,
        expect.objectContaining({
          botsUpserted: 1,
          flowsUpserted: 1,
          botExternalIds: ['wp:bot:101'],
          flowExternalIds: ['wp:flow:201'],
        }),
        1, // userId do admin A
        expect.any(String),
        'tenant-a',
      );
    });
  });

  describe('DTO + payload validation', () => {
    it('400 quando `bots` está vazio', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token}`)
        .send({ bots: [], flows: [] })
        .expect(400);
    });

    it('400 quando flow referencia botExternalSourceId não importado', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bots: [{ externalSourceId: 'wp:bot:999', name: 'Solo' }],
          flows: [
            {
              externalSourceId: 'wp:flow:888',
              botExternalSourceId: 'wp:bot:DOES_NOT_EXIST',
              name: 'Órfão',
              nodes: [],
            },
          ],
        })
        .expect(400);
    });

    it('400 quando bot DTO tem name vazio', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bots: [{ externalSourceId: 'wp:x', name: '' }],
          flows: [],
        })
        .expect(400);
    });
  });

  describe('cross-tenant — escopo do externalSourceId é per-tenant', () => {
    it('admin de B importando `wp:bot:101` (já existe em A) cria bot separado em B', async () => {
      // Conta atual de bots com este externalSourceId em A:
      const inAbefore = store.bots.filter(
        (b) => b.externalSourceId === 'wp:bot:101' && b.tenantId === 'tenant-a',
      ).length;
      expect(inAbefore).toBeGreaterThanOrEqual(1);

      const tokenB = sign(2, 'tenant-b', Role.admin);
      const res = await request(app.getHttpServer())
        .post('/botify/import/wordpress')
        .set('Authorization', `Bearer ${tokenB}`)
        .send(sampleSnapshot())
        .expect(201);
      expect(res.body.botsUpserted).toBe(1);

      // O bot de A NÃO foi tocado:
      const inAafter = store.bots.filter(
        (b) => b.externalSourceId === 'wp:bot:101' && b.tenantId === 'tenant-a',
      ).length;
      expect(inAafter).toBe(inAbefore);

      // Existe agora um bot separado em B:
      const inB = store.bots.find(
        (b) => b.externalSourceId === 'wp:bot:101' && b.tenantId === 'tenant-b',
      );
      expect(inB).toBeDefined();
      expect(inB!.id).not.toBe(
        store.bots.find(
          (b) =>
            b.externalSourceId === 'wp:bot:101' && b.tenantId === 'tenant-a',
        )!.id,
      );
    });
  });
});
