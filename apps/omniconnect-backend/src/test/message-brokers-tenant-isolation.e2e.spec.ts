/**
 * Sprint Foundation — F1.
 *
 * E2E tenant isolation para `/message-brokers`. Cobre as regras
 * obrigatórias de `.cursor/rules/01-multitenancy.mdc`:
 *  - tenant A nunca lê/atualiza/deleta/testa broker de B
 *  - credenciais cifradas (`apiKey`, `apiSecret`, `webhookSecret`)
 *    nunca aparecem no body de resposta
 *  - papéis: admin pode tudo; supervisor pode listar e testar; broker
 *    é rejeitado em qualquer endpoint
 *  - cascata SET NULL em `fallbackBrokerId` quando o broker pai é
 *    deletado (não quebra o fallbackOf restante)
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { MessageBrokerChannel, MessageBrokerStatus, Role } from '@prisma/client';
import request from 'supertest';

import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { SystemEventsService } from '../system-events/system-events.service';
import { MessageBrokersController } from '../message-brokers/message-brokers.controller';
import { MessageBrokersService } from '../message-brokers/message-brokers.service';

const JWT_SECRET = 'message-brokers-e2e-secret';
const CIPHER_KEY = Buffer.alloc(32, 0xab).toString('base64');

function buildInMemoryPrisma() {
  const users = [
    { id: 1, email: 'admin-a@a.com', name: 'Admin A', role: Role.admin },
    { id: 2, email: 'admin-b@b.com', name: 'Admin B', role: Role.admin },
    { id: 3, email: 'sup-a@a.com', name: 'Sup A', role: Role.supervisor },
    { id: 4, email: 'broker-a@a.com', name: 'Broker A', role: Role.broker },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
    { userId: 3, tenantId: 'tenant-a', role: Role.supervisor },
    { userId: 4, tenantId: 'tenant-a', role: Role.broker },
  ];

  let brokerSeq = 1;
  type BrokerRow = {
    id: string;
    tenantId: string;
    channel: MessageBrokerChannel;
    vendor: string;
    label: string;
    status: MessageBrokerStatus;
    autoDisableOnBounce: boolean;
    monthlyCostCents: number;
    fallbackBrokerId: string | null;
    statusMap: unknown;
    apiKeyEncrypted: string | null;
    apiSecretEncrypted: string | null;
    webhookSecretEncrypted: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdById: number | null;
  };
  const brokers: BrokerRow[] = [];

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
    messageBroker: {
      create: async ({ data }: any) => {
        const row: BrokerRow = {
          id: `mb-${brokerSeq++}`,
          tenantId: data.tenantId,
          channel: data.channel,
          vendor: data.vendor,
          label: data.label,
          status: data.status ?? MessageBrokerStatus.connected,
          autoDisableOnBounce: data.autoDisableOnBounce ?? true,
          monthlyCostCents: data.monthlyCostCents ?? 0,
          fallbackBrokerId: data.fallbackBrokerId ?? null,
          statusMap: data.statusMap,
          apiKeyEncrypted: data.apiKeyEncrypted ?? null,
          apiSecretEncrypted: data.apiSecretEncrypted ?? null,
          webhookSecretEncrypted: data.webhookSecretEncrypted ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: data.createdById ?? null,
        };
        brokers.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        brokers
          .filter(
            (b) =>
              b.tenantId === where.tenantId &&
              (!where.channel || b.channel === where.channel) &&
              (!where.status || b.status === where.status),
          )
          .sort((a, b) => a.label.localeCompare(b.label)),
      findFirst: async ({ where }: any) => {
        return (
          brokers.find(
            (b) =>
              (where.id ? b.id === where.id : true) &&
              (where.tenantId ? b.tenantId === where.tenantId : true),
          ) ?? null
        );
      },
      update: async ({ where, data }: any) => {
        const row = brokers.find((b) => b.id === where.id);
        if (!row) throw new Error(`MessageBroker ${where.id} not found`);
        if (data.vendor !== undefined) row.vendor = data.vendor;
        if (data.label !== undefined) row.label = data.label;
        if (data.status !== undefined) row.status = data.status;
        if (data.autoDisableOnBounce !== undefined) row.autoDisableOnBounce = data.autoDisableOnBounce;
        if (data.monthlyCostCents !== undefined) row.monthlyCostCents = data.monthlyCostCents;
        if (data.statusMap !== undefined) row.statusMap = data.statusMap;
        if (data.apiKeyEncrypted !== undefined) row.apiKeyEncrypted = data.apiKeyEncrypted;
        if (data.apiSecretEncrypted !== undefined) row.apiSecretEncrypted = data.apiSecretEncrypted;
        if (data.webhookSecretEncrypted !== undefined) row.webhookSecretEncrypted = data.webhookSecretEncrypted;
        if (data.fallbackBroker?.disconnect) row.fallbackBrokerId = null;
        else if (data.fallbackBroker?.connect?.id) row.fallbackBrokerId = data.fallbackBroker.connect.id;
        row.updatedAt = new Date();
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = brokers.findIndex((b) => b.id === where.id);
        if (idx < 0) throw new Error(`MessageBroker ${where.id} not found`);
        const removed = brokers[idx];
        // Simula cascata SET NULL
        for (const b of brokers) {
          if (b.fallbackBrokerId === removed.id) b.fallbackBrokerId = null;
        }
        brokers.splice(idx, 1);
        return removed;
      },
    },
    systemEvent: {
      create: async () => undefined,
    },
  };

  return { prisma, users, userTenants, brokers };
}

describe('MessageBrokers (E2E tenant isolation)', () => {
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
          load: [
            () => ({
              JWT_SECRET,
              NODE_ENV: 'test',
              BRIDGE_SECRET_KEY: CIPHER_KEY,
            }),
          ],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [MessageBrokersController],
      providers: [
        JwtStrategy,
        ConfigService,
        MessageBrokersService,
        BridgeSecretCipher,
        { provide: PrismaService, useValue: store.prisma },
        {
          provide: SystemEventsService,
          useValue: { logEvent: async () => undefined },
        },
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

  const validBody = {
    channel: MessageBrokerChannel.sms,
    vendor: 'twilio',
    label: 'Twilio SMS principal',
    statusMap: { delivered: 'sent', failed: 'invalid' },
    apiKey: 'sk-test-1234567890',
  };

  describe('auth gating', () => {
    it('exige autenticação', async () => {
      await request(app.getHttpServer()).get('/message-brokers').expect(401);
    });

    it('rejeita broker role em GET', async () => {
      const token = sign(4, 'tenant-a', Role.broker);
      await request(app.getHttpServer())
        .get('/message-brokers')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('rejeita supervisor em POST (só admin pode criar)', async () => {
      const token = sign(3, 'tenant-a', Role.supervisor);
      await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)
        .expect(403);
    });
  });

  describe('create + mask', () => {
    let createdId: string;

    it('admin de tenant A cria broker; resposta não vaza apiKey plaintext', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)
        .expect(201);

      expect(res.body.tenantId).toBe('tenant-a');
      expect(res.body.channel).toBe('sms');
      expect(res.body.vendor).toBe('twilio');
      expect(res.body.hasApiKey).toBe(true);
      expect(res.body.apiKeyHint).toBe('7890'); // últimos 4 chars do plaintext recém-enviado
      // PROVA: nenhum campo de credencial sensível aparece no body
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('sk-test-1234567890');
      expect(serialized).not.toContain('apiKeyEncrypted');
      expect(serialized).not.toContain('apiSecretEncrypted');
      expect(serialized).not.toContain('webhookSecretEncrypted');
      createdId = res.body.id;
    });

    it('GET subsequente nunca devolve hint (só create/update têm hint)', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get(`/message-brokers/${createdId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.hasApiKey).toBe(true);
      expect(res.body.apiKeyHint).toBeNull();
    });
  });

  describe('cross-tenant isolation', () => {
    let brokerOfA: string;

    beforeAll(async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, label: 'Broker isolado A' })
        .expect(201);
      brokerOfA = res.body.id;
    });

    it('admin de tenant B NÃO vê broker de A na listagem', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/message-brokers')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('Broker isolado A');
      const ids = (res.body as Array<{ id: string }>).map((b) => b.id);
      expect(ids).not.toContain(brokerOfA);
    });

    it('admin de tenant B não consegue ler broker de A (404)', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .get(`/message-brokers/${brokerOfA}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('admin de tenant B não consegue atualizar broker de A (404)', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .patch(`/message-brokers/${brokerOfA}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ label: 'hacked' })
        .expect(404);
    });

    it('admin de tenant B não consegue deletar broker de A (404)', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .delete(`/message-brokers/${brokerOfA}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('admin de tenant B não consegue testar broker de A (404)', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .post(`/message-brokers/${brokerOfA}/test`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('fallback chain', () => {
    it('admin não pode setar fallbackBrokerId de outro tenant', async () => {
      const tokenA = sign(1, 'tenant-a', Role.admin);
      const tokenB = sign(2, 'tenant-b', Role.admin);

      const brokerA = await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...validBody, label: 'Primary A' })
        .expect(201);

      const brokerB = await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ ...validBody, label: 'Primary B' })
        .expect(201);

      // Tenant A tenta apontar fallback pro broker de B → 400
      await request(app.getHttpServer())
        .patch(`/message-brokers/${brokerA.body.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ fallbackBrokerId: brokerB.body.id })
        .expect(400);
    });

    it('broker não pode ser fallback de si mesmo (400)', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, label: 'Self-loop attempt' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/message-brokers/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fallbackBrokerId: res.body.id })
        .expect(400);
    });

    it('DELETE do broker pai zera fallbackBrokerId dos filhos (não quebra)', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const parent = await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, label: 'Parent' })
        .expect(201);
      const child = await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, label: 'Child', fallbackBrokerId: parent.body.id })
        .expect(201);
      expect(child.body.fallbackBrokerId).toBe(parent.body.id);

      await request(app.getHttpServer())
        .delete(`/message-brokers/${parent.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const childAfter = await request(app.getHttpServer())
        .get(`/message-brokers/${child.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(childAfter.body.fallbackBrokerId).toBeNull();
    });
  });

  describe('test smoke', () => {
    it('test endpoint reporta canDecrypt=true quando apiKey foi configurada', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const created = await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, label: 'Test target' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .post(`/message-brokers/${created.body.id}/test`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(res.body.canDecrypt).toBe(true);
      expect(res.body.status).toBe('connected');
      // Nem o test endpoint pode vazar plaintext
      expect(JSON.stringify(res.body)).not.toContain('sk-test-1234567890');
    });

    it('supervisor pode chamar test', async () => {
      const adminToken = sign(1, 'tenant-a', Role.admin);
      const supToken = sign(3, 'tenant-a', Role.supervisor);
      const created = await request(app.getHttpServer())
        .post('/message-brokers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBody, label: 'Supervisor-tested' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/message-brokers/${created.body.id}/test`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(201);
    });
  });
});
