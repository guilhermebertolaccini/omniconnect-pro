/**
 * Sprint 6 — Botify G3 (ADR-0002, condição 9).
 *
 * E2E HTTP do novo endpoint `POST /botify/runtime/process`, que aciona
 * o engine em modo persistente: resolve/cria `BotifyConversation`,
 * grava `BotifyMessage(role=user)` da entrada, executa o grafo
 * (nó `message` e nó `ai` com fallback heurístico do `BotifyAIChatService`
 * quando `OPENAI_API_KEY` não está setado), e persiste cada resposta
 * `assistant`. Também valida o caminho `dryRun=true` (idêntico ao
 * `/simulate`: sem persistência, sem handoff).
 *
 * Cobre:
 *  - auth gating (401 sem JWT) e role gating (operator é permitido)
 *  - cross-tenant: admin de B NÃO consegue acionar flow de A (404)
 *  - DTO rejeita payload inválido (flowId não-UUID, phone vazio)
 *  - persistência: 1ª chamada cria `BotifyConversation` + persiste
 *    `user` (inbound) + `assistant` (saída do nó `message` + nó `ai`)
 *  - upsert: 2ª chamada no mesmo `phone` reusa a conversa (1 ID só)
 *  - `dryRun=true` não cria conversa nem mensagens
 *
 * Não exercita o caminho real OpenAI — checamos só o fallback determinístico
 * do `BotifyAIChatService` quando `OPENAI_API_KEY` está vazio (modo CI).
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { BotifyMessageRole, Role } from '@prisma/client';
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
import { SystemEventsService } from '../system-events/system-events.service';

const JWT_SECRET = 'botify-g3-e2e-secret';

interface BotRow {
  id: string;
  tenantId: string;
  name: string;
}

interface FlowRow {
  id: string;
  tenantId: string;
  botId: string;
  name: string;
  draftGraph: unknown;
  publishedGraph: unknown;
}

interface ConversationRow {
  id: string;
  tenantId: string;
  botId: string;
  contactPhone: string;
  contactName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageRow {
  id: string;
  tenantId: string;
  conversationId: string;
  role: BotifyMessageRole;
  content: string;
  metadata: unknown;
  createdAt: Date;
}

function buildPrisma() {
  const users = [
    { id: 1, email: 'admin-a@a.com', name: 'Admin A', role: Role.admin },
    { id: 2, email: 'admin-b@b.com', name: 'Admin B', role: Role.admin },
    { id: 3, email: 'op-a@a.com', name: 'Op A', role: Role.operator },
    { id: 4, email: 'broker-a@a.com', name: 'Broker A', role: Role.broker },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
    { userId: 3, tenantId: 'tenant-a', role: Role.operator },
    { userId: 4, tenantId: 'tenant-a', role: Role.broker },
  ];

  const bots: BotRow[] = [];
  const flows: FlowRow[] = [];
  const conversations: ConversationRow[] = [];
  const messages: MessageRow[] = [];

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
      findFirst: async ({ where }: any) =>
        bots.find(
          (b) =>
            (!where?.tenantId || b.tenantId === where.tenantId) &&
            (!where?.id || b.id === where.id),
        ) ?? null,
    },
    botifyFlow: {
      findFirst: async ({ where }: any) =>
        flows.find(
          (f) =>
            (!where?.tenantId || f.tenantId === where.tenantId) &&
            (!where?.id || f.id === where.id),
        ) ?? null,
    },
    botifyConversation: {
      findFirst: async ({ where }: any) =>
        conversations.find(
          (c) =>
            (!where?.tenantId || c.tenantId === where.tenantId) &&
            (!where?.id || c.id === where.id),
        ) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const key = where.tenantId_botId_contactPhone;
        const existing = conversations.find(
          (c) =>
            c.tenantId === key.tenantId &&
            c.botId === key.botId &&
            c.contactPhone === key.contactPhone,
        );
        if (existing) {
          if (update.contactName !== undefined) {
            existing.contactName = update.contactName;
          }
          existing.updatedAt = new Date();
          return { id: existing.id };
        }
        const row: ConversationRow = {
          id: randomUUID(),
          tenantId: create.tenantId,
          botId: create.botId,
          contactPhone: create.contactPhone,
          contactName: create.contactName ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        conversations.push(row);
        return { id: row.id };
      },
    },
    botifyMessage: {
      create: async ({ data }: any) => {
        const row: MessageRow = {
          id: randomUUID(),
          tenantId: data.tenantId,
          conversationId: data.conversationId,
          role: data.role,
          content: data.content,
          metadata: data.metadata ?? null,
          createdAt: new Date(),
        };
        messages.push(row);
        return row;
      },
      findMany: async ({ where, orderBy, take, select: _select }: any) => {
        let rows = messages.filter(
          (m) =>
            (!where?.tenantId || m.tenantId === where.tenantId) &&
            (!where?.conversationId ||
              m.conversationId === where.conversationId),
        );
        if (orderBy?.createdAt === 'desc') {
          rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else {
          rows = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (take) rows = rows.slice(0, take);
        return rows.map((m) => ({ role: m.role, content: m.content }));
      },
    },
  };

  return { prisma, users, bots, flows, conversations, messages };
}

/** Grafo simples: start → message → ai */
function makeGraph(opts: { greeting: string; systemPrompt?: string }) {
  return {
    schemaVersion: '1',
    nodes: [
      {
        id: 'n-start',
        type: 'start',
        data: {},
        connections: [{ target: 'n-msg' }],
      },
      {
        id: 'n-msg',
        type: 'message',
        data: { content: opts.greeting },
        connections: [{ target: 'n-ai' }],
      },
      {
        id: 'n-ai',
        type: 'ai',
        data: { systemPrompt: opts.systemPrompt ?? 'Você é um SDR.' },
        connections: [],
      },
    ],
  };
}

describe('Botify G3 (E2E engine persistente)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let store: ReturnType<typeof buildPrisma>;
  let flowOfA: string;
  let botOfA: string;
  const originalKey = process.env.OPENAI_API_KEY;

  beforeAll(async () => {
    // Garante que o engine entra no caminho fallback (sem OpenAI) — determinístico.
    delete process.env.OPENAI_API_KEY;

    store = buildPrisma();

    // Seed: bot + flow publicado em tenant-a; bot + flow no tenant-b
    botOfA = randomUUID();
    flowOfA = randomUUID();
    store.bots.push({ id: botOfA, tenantId: 'tenant-a', name: 'Triagem A' });
    store.flows.push({
      id: flowOfA,
      tenantId: 'tenant-a',
      botId: botOfA,
      name: 'Boas-vindas A',
      draftGraph: null,
      publishedGraph: makeGraph({ greeting: 'Olá! Como posso ajudar?' }),
    });
    const botB = randomUUID();
    store.bots.push({ id: botB, tenantId: 'tenant-b', name: 'Triagem B' });
    store.flows.push({
      id: randomUUID(),
      tenantId: 'tenant-b',
      botId: botB,
      name: 'Boas-vindas B',
      draftGraph: null,
      publishedGraph: makeGraph({ greeting: 'Hi B' }),
    });

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
        BotifyFlowEngineService,
        BotifyAIChatService,
        { provide: PrismaService, useValue: store.prisma },
        { provide: IntegrationBridgeEmitService, useValue: { emitForTenant: jest.fn() } },
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
    if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
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

  describe('auth + roles', () => {
    it('401 sem JWT', async () => {
      await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .send({})
        .expect(401);
    });

    it('broker rejeitado (403)', async () => {
      const token = sign(4, 'tenant-a', Role.broker);
      await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .set('Authorization', `Bearer ${token}`)
        .send({
          flowId: flowOfA,
          botId: botOfA,
          phone: '+5511999990001',
          text: 'oi',
        })
        .expect(403);
    });

    it('operator pode acionar (200)', async () => {
      const token = sign(3, 'tenant-a', Role.operator);
      const res = await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .set('Authorization', `Bearer ${token}`)
        .send({
          flowId: flowOfA,
          botId: botOfA,
          phone: '+5511999990002',
          text: 'preciso de info',
        })
        .expect(201);
      expect(res.body.flowId).toBe(flowOfA);
      expect(res.body.outboundMessages).toEqual(
        expect.arrayContaining(['Olá! Como posso ajudar?']),
      );
    });
  });

  describe('DTO validation', () => {
    it('400 quando flowId não é UUID', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .set('Authorization', `Bearer ${token}`)
        .send({
          flowId: 'not-uuid',
          botId: botOfA,
          phone: '+5511999990003',
          text: 'oi',
        })
        .expect(400);
    });

    it('400 quando phone vazio', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .set('Authorization', `Bearer ${token}`)
        .send({
          flowId: flowOfA,
          botId: botOfA,
          phone: '',
          text: 'oi',
        })
        .expect(400);
    });
  });

  describe('cross-tenant', () => {
    it('admin de B 404 ao acionar flow de A', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .set('Authorization', `Bearer ${token}`)
        .send({
          flowId: flowOfA,
          botId: botOfA,
          phone: '+5511999990004',
          text: 'tentando hijack',
        })
        .expect(404);
    });
  });

  describe('persistência (modo G3)', () => {
    const phone = '+5511999990010';
    const token = () => sign(1, 'tenant-a', Role.admin);

    it('1ª chamada cria conversa + persiste user inbound + assistant (message + ai fallback)', async () => {
      const before = store.conversations.length;
      const res = await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .set('Authorization', `Bearer ${token()}`)
        .send({
          flowId: flowOfA,
          botId: botOfA,
          phone,
          text: 'quero comprar um apto na Vila Madalena',
          contactName: 'João',
        })
        .expect(201);

      expect(res.body.flowId).toBe(flowOfA);
      // 1 mensagem do nó `message` + 1 do nó `ai` (fallback determinístico):
      expect(res.body.outboundMessages.length).toBe(2);
      expect(res.body.outboundMessages[0]).toBe('Olá! Como posso ajudar?');
      expect(res.body.outboundMessages[1]).toMatch(/Recebi sua mensagem/);

      // `findFlowEntryNode` resolve diretamente para o alvo de `start`,
      // então o engine começa em `message`.
      expect(res.body.steps.map((s: any) => s.type)).toEqual([
        'message',
        'ai',
      ]);
      const aiStep = res.body.steps.find((s: any) => s.type === 'ai');
      expect(aiStep.detail.provider).toBe('fallback');

      expect(store.conversations.length).toBe(before + 1);
      const conv = store.conversations.find(
        (c) =>
          c.tenantId === 'tenant-a' &&
          c.botId === botOfA &&
          c.contactPhone === phone,
      )!;
      expect(conv).toBeDefined();
      expect(conv.contactName).toBe('João');

      const convMsgs = store.messages.filter(
        (m) => m.conversationId === conv.id,
      );
      // user inbound + 2 assistants (message + ai)
      expect(convMsgs.length).toBe(3);
      expect(convMsgs[0].role).toBe(BotifyMessageRole.user);
      expect(convMsgs[0].content).toBe('quero comprar um apto na Vila Madalena');
      expect(convMsgs.filter((m) => m.role === BotifyMessageRole.assistant).length).toBe(2);
    });

    it('2ª chamada no mesmo phone reusa conversa (upsert)', async () => {
      const before = store.conversations.length;
      await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .set('Authorization', `Bearer ${token()}`)
        .send({
          flowId: flowOfA,
          botId: botOfA,
          phone,
          text: 'tenho urgência',
        })
        .expect(201);

      // Não cria nova conversa
      expect(store.conversations.length).toBe(before);
      const conv = store.conversations.find(
        (c) =>
          c.tenantId === 'tenant-a' &&
          c.botId === botOfA &&
          c.contactPhone === phone,
      )!;
      const convMsgs = store.messages.filter(
        (m) => m.conversationId === conv.id,
      );
      // 3 (anterior) + 1 user + 2 assistant = 6
      expect(convMsgs.length).toBe(6);
    });

    it('normaliza phone (dígitos → E.164) — `11999990010` cai na mesma conversa', async () => {
      const before = store.conversations.length;
      await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .set('Authorization', `Bearer ${token()}`)
        .send({
          flowId: flowOfA,
          botId: botOfA,
          phone: '5511999990010',
          text: 'sem o +',
        })
        .expect(201);
      // Engine normaliza para `+5511999990010` (mesmo key) ⇒ upsert reusa
      expect(store.conversations.length).toBe(before);
    });
  });

  describe('dryRun=true', () => {
    it('não cria conversa nem mensagens', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const beforeC = store.conversations.length;
      const beforeM = store.messages.length;
      const res = await request(app.getHttpServer())
        .post('/botify/runtime/process')
        .set('Authorization', `Bearer ${token}`)
        .send({
          flowId: flowOfA,
          botId: botOfA,
          phone: '+5511999990099',
          text: 'preview',
          dryRun: true,
        })
        .expect(201);
      expect(res.body.outboundMessages.length).toBeGreaterThan(0);
      expect(store.conversations.length).toBe(beforeC);
      expect(store.messages.length).toBe(beforeM);
    });
  });
});
