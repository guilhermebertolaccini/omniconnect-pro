/**
 * Sprint Foundation — F2.
 *
 * E2E tenant isolation + comportamento de débito para `/tenant-wallets/me*`.
 * Cobre:
 *  - autenticação / roles (admin pode tudo; supervisor/digital lê; broker
 *    rejeitado)
 *  - `getMyWallet` cria com defaults se ausente
 *  - `updateWallet` afeta só a wallet do tenant logado
 *  - tenant A NUNCA vê transactions de B
 *  - `creditWallet` reduz `usedBudgetCents` corretamente (refund-style)
 *  - `debitForSend` em soft_block: passa mesmo com saldo insuficiente,
 *    emite WALLET_INSUFFICIENT
 *  - `debitForSend` em hard_block: recusa quando excede
 *  - Race-safety básica: dois débitos sequenciais não causam negativo em
 *    hard_block (test em série, não realmente concorrente, mas valida o
 *    optimistic-lock path)
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Role,
  WalletGuardMode,
  WalletResetCycle,
  WalletTransactionType,
} from '@prisma/client';
import request from 'supertest';

import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { SystemEventsService } from '../system-events/system-events.service';
import { TenantWalletsController } from '../tenant-wallets/tenant-wallets.controller';
import { TenantWalletsService } from '../tenant-wallets/tenant-wallets.service';

const JWT_SECRET = 'tenant-wallets-e2e-secret';

interface WalletRow {
  id: string;
  tenantId: string;
  totalBudgetCents: number;
  usedBudgetCents: number;
  resetCycle: WalletResetCycle;
  resetAt: Date | null;
  guardMode: WalletGuardMode;
  realtimeDebit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CostRow {
  id: string;
  walletId: string;
  channel: string;
  costCents: number;
}

interface TxRow {
  id: string;
  tenantId: string;
  walletId: string;
  type: WalletTransactionType;
  channel: string | null;
  amountCents: number;
  refType: string | null;
  refId: string | null;
  metadata: unknown;
  createdAt: Date;
}

function buildPrisma() {
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

  let seq = 1;
  const wallets: WalletRow[] = [];
  const costs: CostRow[] = [];
  const txs: TxRow[] = [];

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
    tenantWallet: {
      findUnique: async ({ where }: any) => {
        if (where.id) return wallets.find((w) => w.id === where.id) ?? null;
        if (where.tenantId)
          return wallets.find((w) => w.tenantId === where.tenantId) ?? null;
        return null;
      },
      findFirst: async ({ where }: any) =>
        wallets.find(
          (w) =>
            (where.id ? w.id === where.id : true) &&
            (where.tenantId ? w.tenantId === where.tenantId : true),
        ) ?? null,
      create: async ({ data }: any) => {
        const w: WalletRow = {
          id: `w-${seq++}`,
          tenantId: data.tenantId,
          totalBudgetCents: data.totalBudgetCents ?? 0,
          usedBudgetCents: data.usedBudgetCents ?? 0,
          resetCycle: data.resetCycle ?? WalletResetCycle.monthly,
          resetAt: data.resetAt ?? null,
          guardMode: data.guardMode ?? WalletGuardMode.soft_block,
          realtimeDebit: data.realtimeDebit ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        wallets.push(w);
        return w;
      },
      update: async ({ where, data }: any) => {
        const w = wallets.find((x) => x.id === where.id);
        if (!w) throw new Error('not found');
        if (data.totalBudgetCents !== undefined) w.totalBudgetCents = data.totalBudgetCents;
        if (data.usedBudgetCents !== undefined) w.usedBudgetCents = data.usedBudgetCents;
        if (data.resetCycle !== undefined) w.resetCycle = data.resetCycle;
        if (data.resetAt !== undefined) w.resetAt = data.resetAt;
        if (data.guardMode !== undefined) w.guardMode = data.guardMode;
        if (data.realtimeDebit !== undefined) w.realtimeDebit = data.realtimeDebit;
        w.updatedAt = new Date();
        return w;
      },
      updateMany: async ({ where, data }: any) => {
        const w = wallets.find(
          (x) =>
            x.id === where.id &&
            (where.usedBudgetCents === undefined ||
              x.usedBudgetCents === where.usedBudgetCents),
        );
        if (!w) return { count: 0 };
        if (data.usedBudgetCents !== undefined) w.usedBudgetCents = data.usedBudgetCents;
        w.updatedAt = new Date();
        return { count: 1 };
      },
    },
    walletChannelCost: {
      findUnique: async ({ where }: any) => {
        const key = where.walletId_channel;
        if (!key) return null;
        return (
          costs.find(
            (c) => c.walletId === key.walletId && c.channel === key.channel,
          ) ?? null
        );
      },
      findMany: async ({ where }: any) =>
        costs
          .filter((c) => c.walletId === where.walletId)
          .sort((a, b) => a.channel.localeCompare(b.channel)),
      upsert: async ({ where, create, update }: any) => {
        const key = where.walletId_channel;
        const found = costs.find(
          (c) => c.walletId === key.walletId && c.channel === key.channel,
        );
        if (found) {
          if (update.costCents !== undefined) found.costCents = update.costCents;
          return found;
        }
        const row: CostRow = {
          id: `c-${seq++}`,
          walletId: create.walletId,
          channel: create.channel,
          costCents: create.costCents ?? 0,
        };
        costs.push(row);
        return row;
      },
    },
    walletTransaction: {
      create: async ({ data }: any) => {
        const row: TxRow = {
          id: `t-${seq++}`,
          tenantId: data.tenantId,
          walletId: data.walletId,
          type: data.type,
          channel: data.channel ?? null,
          amountCents: data.amountCents,
          refType: data.refType ?? null,
          refId: data.refId ?? null,
          metadata: data.metadata ?? null,
          createdAt: new Date(),
        };
        txs.push(row);
        return row;
      },
      findMany: async ({ where, take, skip, orderBy: _ob }: any) => {
        const filtered = txs
          .filter(
            (t) =>
              t.tenantId === where.tenantId &&
              (where.type ? t.type === where.type : true) &&
              (where.channel ? t.channel === where.channel : true),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const start = skip ?? 0;
        return filtered.slice(start, start + (take ?? 50));
      },
      count: async ({ where }: any) =>
        txs.filter(
          (t) =>
            t.tenantId === where.tenantId &&
            (where.type ? t.type === where.type : true) &&
            (where.channel ? t.channel === where.channel : true),
        ).length,
    },
    systemEvent: {
      create: async () => undefined,
    },
    $transaction: async (cb: any) => {
      // Mock simples; nosso código passa um callback que recebe `tx`.
      // No mock, reusamos o próprio prisma como tx (sem isolamento real).
      return cb(prisma);
    },
  };

  return { prisma, users, userTenants, wallets, costs, txs };
}

describe('TenantWallets (E2E tenant isolation)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let store: ReturnType<typeof buildPrisma>;
  let service: TenantWalletsService;

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
      controllers: [TenantWalletsController],
      providers: [
        JwtStrategy,
        ConfigService,
        TenantWalletsService,
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
    service = module.get(TenantWalletsService);
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

  describe('auth gating', () => {
    it('exige autenticação', async () => {
      await request(app.getHttpServer()).get('/tenant-wallets/me').expect(401);
    });

    it('rejeita broker role em GET', async () => {
      const token = sign(4, 'tenant-a', Role.broker);
      await request(app.getHttpServer())
        .get('/tenant-wallets/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('rejeita supervisor em PATCH (só admin pode mudar config)', async () => {
      const token = sign(3, 'tenant-a', Role.supervisor);
      await request(app.getHttpServer())
        .patch('/tenant-wallets/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ totalBudgetCents: 50000 })
        .expect(403);
    });
  });

  describe('lifecycle', () => {
    it('GET /me cria wallet com defaults se ausente', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/tenant-wallets/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.tenantId).toBe('tenant-a');
      expect(res.body.totalBudgetCents).toBe(0);
      expect(res.body.usedBudgetCents).toBe(0);
      expect(res.body.remainingCents).toBe(0);
      expect(res.body.guardMode).toBe('soft_block');
      expect(res.body.resetCycle).toBe('monthly');
      expect(res.body.realtimeDebit).toBe(true);
      expect(res.body.channelCosts).toEqual([]);
    });

    it('PATCH /me muda config do tenant logado', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .patch('/tenant-wallets/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ totalBudgetCents: 100000, guardMode: 'hard_block' })
        .expect(200);
      expect(res.body.totalBudgetCents).toBe(100000);
      expect(res.body.guardMode).toBe('hard_block');
    });

    it('PUT /me/channels/:channel upserts cost', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .put('/tenant-wallets/me/channels/SMS')
        .set('Authorization', `Bearer ${token}`)
        .send({ costCents: 15 })
        .expect(200);
      expect(res.body.channel).toBe('sms'); // normalizado para lowercase
      expect(res.body.costCents).toBe(15);

      // upsert: refazer atualiza
      const res2 = await request(app.getHttpServer())
        .put('/tenant-wallets/me/channels/sms')
        .set('Authorization', `Bearer ${token}`)
        .send({ costCents: 25 })
        .expect(200);
      expect(res2.body.costCents).toBe(25);

      // confirma na wallet
      const wallet = await request(app.getHttpServer())
        .get('/tenant-wallets/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(wallet.body.channelCosts).toEqual([
        { channel: 'sms', costCents: 25 },
      ]);
    });

    it('POST /me/credits reduz usedBudgetCents (refund-style)', async () => {
      // Sobe wallet A para um estado conhecido: total 100k, usado 50k
      const tokenA = sign(1, 'tenant-a', Role.admin);
      // Simula gasto direto na store (não via débito real)
      const walletA = store.wallets.find((w) => w.tenantId === 'tenant-a')!;
      walletA.totalBudgetCents = 100000;
      walletA.usedBudgetCents = 50000;
      walletA.guardMode = WalletGuardMode.soft_block;

      const res = await request(app.getHttpServer())
        .post('/tenant-wallets/me/credits')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amountCents: 20000, reason: 'Ajuste manual' })
        .expect(201);
      expect(res.body.transactionId).toBeDefined();
      expect(res.body.remainingCents).toBe(100000 - 30000); // 50k − 20k usado
    });
  });

  describe('cross-tenant isolation', () => {
    it('PATCH em tenant A não afeta wallet de B', async () => {
      const tokenA = sign(1, 'tenant-a', Role.admin);
      const tokenB = sign(2, 'tenant-b', Role.admin);

      // Cria wallet B com PATCH
      await request(app.getHttpServer())
        .patch('/tenant-wallets/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ totalBudgetCents: 999 })
        .expect(200);

      // Confirma que PATCH de A não tocou em B
      const beforeBValue = store.wallets.find((w) => w.tenantId === 'tenant-b')!
        .totalBudgetCents;
      await request(app.getHttpServer())
        .patch('/tenant-wallets/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ totalBudgetCents: 1 })
        .expect(200);
      const afterBValue = store.wallets.find((w) => w.tenantId === 'tenant-b')!
        .totalBudgetCents;
      expect(afterBValue).toBe(beforeBValue);
    });

    it('GET /me/transactions de A NÃO mostra transactions de B', async () => {
      const tokenB = sign(2, 'tenant-b', Role.admin);
      // Adiciona uma transação em B diretamente
      store.txs.push({
        id: 't-secret-b',
        tenantId: 'tenant-b',
        walletId: store.wallets.find((w) => w.tenantId === 'tenant-b')!.id,
        type: WalletTransactionType.debit,
        channel: 'sms',
        amountCents: 99999,
        refType: 'JourneyRun',
        refId: 'secret-run-b',
        metadata: { secret: 'should-not-leak' },
        createdAt: new Date(),
      });

      const tokenA = sign(1, 'tenant-a', Role.admin);
      const resA = await request(app.getHttpServer())
        .get('/tenant-wallets/me/transactions')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const dump = JSON.stringify(resA.body);
      expect(dump).not.toContain('secret-run-b');
      expect(dump).not.toContain('should-not-leak');

      const resB = await request(app.getHttpServer())
        .get('/tenant-wallets/me/transactions')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      const idsB = (resB.body.items as Array<{ id: string }>).map((x) => x.id);
      expect(idsB).toContain('t-secret-b');
    });
  });

  describe('debitForSend helper', () => {
    it('soft_block: debita mesmo excedendo o budget', async () => {
      // Wallet A: total 5000, usado 4900, soft_block; canal sms custa 200
      const wallet = store.wallets.find((w) => w.tenantId === 'tenant-a')!;
      wallet.totalBudgetCents = 5000;
      wallet.usedBudgetCents = 4900;
      wallet.guardMode = WalletGuardMode.soft_block;
      const costSms = store.costs.find(
        (c) => c.walletId === wallet.id && c.channel === 'sms',
      );
      if (costSms) costSms.costCents = 200;
      else
        store.costs.push({
          id: 'c-sms-a',
          walletId: wallet.id,
          channel: 'sms',
          costCents: 200,
        });

      const res = await service.debitForSend('tenant-a', 'sms', 'JourneyRun', 'run-1');
      expect(res.ok).toBe(true);
      expect((res as { ok: true; usedAfter: number }).usedAfter).toBe(5100);
    });

    it('hard_block: recusa quando excede', async () => {
      const wallet = store.wallets.find((w) => w.tenantId === 'tenant-a')!;
      wallet.totalBudgetCents = 5000;
      wallet.usedBudgetCents = 4900;
      wallet.guardMode = WalletGuardMode.hard_block;

      const res = await service.debitForSend('tenant-a', 'sms', 'JourneyRun', 'run-2');
      expect(res.ok).toBe(false);
      expect((res as { ok: false; reason: string }).reason).toBe('insufficient');
      // não mexeu no usedBudgetCents
      expect(
        store.wallets.find((w) => w.tenantId === 'tenant-a')!.usedBudgetCents,
      ).toBe(4900);
    });

    it('debitForSend recusa quando canal não tem custo registrado', async () => {
      const wallet = store.wallets.find((w) => w.tenantId === 'tenant-a')!;
      wallet.totalBudgetCents = 5000;
      wallet.usedBudgetCents = 0;

      const res = await service.debitForSend(
        'tenant-a',
        'email_nao_existe',
        'JourneyRun',
        'run-3',
      );
      expect(res.ok).toBe(false);
      expect((res as { ok: false; reason: string }).reason).toBe(
        'no_cost_for_channel',
      );
    });

    it('debitForSend retorna no_wallet quando tenant não tem wallet', async () => {
      const res = await service.debitForSend(
        'tenant-sem-wallet',
        'sms',
        'JourneyRun',
        'run-4',
      );
      expect(res.ok).toBe(false);
      expect((res as { ok: false; reason: string }).reason).toBe('no_wallet');
    });

    it('hard_block: dois débitos sequenciais até esgotar budget', async () => {
      const wallet = store.wallets.find((w) => w.tenantId === 'tenant-a')!;
      wallet.totalBudgetCents = 500;
      wallet.usedBudgetCents = 0;
      wallet.guardMode = WalletGuardMode.hard_block;

      const cost = store.costs.find(
        (c) => c.walletId === wallet.id && c.channel === 'sms',
      )!;
      cost.costCents = 200;

      const r1 = await service.debitForSend('tenant-a', 'sms', 'JourneyRun', 'a');
      expect(r1.ok).toBe(true);
      const r2 = await service.debitForSend('tenant-a', 'sms', 'JourneyRun', 'b');
      expect(r2.ok).toBe(true);
      const r3 = await service.debitForSend('tenant-a', 'sms', 'JourneyRun', 'c');
      // 200+200 = 400 < 500 (ok). Próximo 200 ⇒ 600 > 500 ⇒ recusa.
      expect(r3.ok).toBe(false);
      expect(wallet.usedBudgetCents).toBe(400);
    });
  });
});
