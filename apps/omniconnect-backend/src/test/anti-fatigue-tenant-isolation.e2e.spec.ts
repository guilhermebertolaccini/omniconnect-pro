/**
 * Sprint Foundation — F3.
 *
 * E2E tenant isolation + comportamento do `checkBeforeSend` para
 * `/anti-fatigue/*`. Cobre:
 *  - autenticação / roles (admin pode tudo; supervisor lê; digital lê
 *    apenas dedupe-log; broker rejeitado)
 *  - regra criada com defaults na primeira leitura
 *  - `upsertMyRule` valida par `businessHoursStart/End`
 *  - tenant A NUNCA vê dedupe-log de B
 *  - `checkBeforeSend`: enabled=false → allowed; 2 sends consecutivos
 *    bloqueia o 2º; janela expirada permite de novo; contactKey
 *    diferente permite; off_hours bloqueia mesmo sem histórico
 *  - `allowBypassForUrgent` permite envio dentro da janela quando
 *    `options.urgent=true`
 *  - `recordSend` é write-only para alimentar o histórico
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { AntiFatigueAppliesTo, Role } from '@prisma/client';
import request from 'supertest';

import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { SystemEventsService } from '../system-events/system-events.service';
import { AntiFatigueController } from '../anti-fatigue/anti-fatigue.controller';
import { AntiFatigueService } from '../anti-fatigue/anti-fatigue.service';

const JWT_SECRET = 'anti-fatigue-e2e-secret';

interface RuleRow {
  id: string;
  tenantId: string;
  enabled: boolean;
  windowHours: number;
  appliesTo: AntiFatigueAppliesTo;
  allowBypassForUrgent: boolean;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LogRow {
  id: string;
  tenantId: string;
  contactKey: string;
  channel: string;
  blockedAt: Date;
  refType: string | null;
  refId: string | null;
}

function buildPrisma() {
  const users = [
    { id: 1, email: 'admin-a@a.com', name: 'Admin A', role: Role.admin },
    { id: 2, email: 'admin-b@b.com', name: 'Admin B', role: Role.admin },
    { id: 3, email: 'sup-a@a.com', name: 'Sup A', role: Role.supervisor },
    { id: 4, email: 'digital-a@a.com', name: 'Digital A', role: Role.digital },
    { id: 5, email: 'broker-a@a.com', name: 'Broker A', role: Role.broker },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
    { userId: 3, tenantId: 'tenant-a', role: Role.supervisor },
    { userId: 4, tenantId: 'tenant-a', role: Role.digital },
    { userId: 5, tenantId: 'tenant-a', role: Role.broker },
  ];

  let seq = 1;
  const rules: RuleRow[] = [];
  const logs: LogRow[] = [];

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
    antiFatigueRule: {
      findUnique: async ({ where }: any) =>
        rules.find((r) => r.tenantId === where.tenantId || r.id === where.id) ??
        null,
      create: async ({ data }: any) => {
        const row: RuleRow = {
          id: `r-${seq++}`,
          tenantId: data.tenantId,
          enabled: data.enabled ?? true,
          windowHours: data.windowHours ?? 24,
          appliesTo: data.appliesTo ?? AntiFatigueAppliesTo.both,
          allowBypassForUrgent: data.allowBypassForUrgent ?? false,
          businessHoursStart: data.businessHoursStart ?? null,
          businessHoursEnd: data.businessHoursEnd ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rules.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = rules.find((r) => r.id === where.id);
        if (!row) throw new Error('rule not found');
        if (data.enabled !== undefined) row.enabled = data.enabled;
        if (data.windowHours !== undefined) row.windowHours = data.windowHours;
        if (data.appliesTo !== undefined) row.appliesTo = data.appliesTo;
        if (data.allowBypassForUrgent !== undefined)
          row.allowBypassForUrgent = data.allowBypassForUrgent;
        if (data.businessHoursStart !== undefined)
          row.businessHoursStart = data.businessHoursStart;
        if (data.businessHoursEnd !== undefined)
          row.businessHoursEnd = data.businessHoursEnd;
        row.updatedAt = new Date();
        return row;
      },
    },
    antiFatigueDedupeLog: {
      findFirst: async ({ where, orderBy: _ob }: any) => {
        const matches = logs.filter(
          (l) =>
            l.tenantId === where.tenantId &&
            l.contactKey === where.contactKey &&
            l.channel === where.channel &&
            l.blockedAt >= (where.blockedAt?.gte ?? new Date(0)),
        );
        matches.sort((a, b) => b.blockedAt.getTime() - a.blockedAt.getTime());
        return matches[0] ?? null;
      },
      findMany: async ({ where, take, skip }: any) => {
        const filtered = logs
          .filter(
            (l) =>
              l.tenantId === where.tenantId &&
              (where.contactKey ? l.contactKey === where.contactKey : true) &&
              (where.channel ? l.channel === where.channel : true) &&
              (where.blockedAt
                ? l.blockedAt >= where.blockedAt.gte && l.blockedAt <= where.blockedAt.lte
                : true),
          )
          .sort((a, b) => b.blockedAt.getTime() - a.blockedAt.getTime());
        const start = skip ?? 0;
        return filtered.slice(start, start + (take ?? 50));
      },
      count: async ({ where }: any) =>
        logs.filter(
          (l) =>
            l.tenantId === where.tenantId &&
            (where.contactKey ? l.contactKey === where.contactKey : true) &&
            (where.channel ? l.channel === where.channel : true),
        ).length,
      create: async ({ data }: any) => {
        const row: LogRow = {
          id: `l-${seq++}`,
          tenantId: data.tenantId,
          contactKey: data.contactKey,
          channel: data.channel,
          blockedAt: data.blockedAt ?? new Date(),
          refType: data.refType ?? null,
          refId: data.refId ?? null,
        };
        logs.push(row);
        return row;
      },
    },
    systemEvent: {
      create: async () => undefined,
    },
  };

  return { prisma, users, userTenants, rules, logs };
}

describe('AntiFatigue (E2E tenant isolation)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let store: ReturnType<typeof buildPrisma>;
  let service: AntiFatigueService;

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
      controllers: [AntiFatigueController],
      providers: [
        JwtStrategy,
        ConfigService,
        AntiFatigueService,
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
    service = module.get(AntiFatigueService);
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
    it('exige autenticação em GET /rule', async () => {
      await request(app.getHttpServer()).get('/anti-fatigue/rule').expect(401);
    });

    it('rejeita broker em GET /rule', async () => {
      const token = sign(5, 'tenant-a', Role.broker);
      await request(app.getHttpServer())
        .get('/anti-fatigue/rule')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('rejeita supervisor em PUT /rule', async () => {
      const token = sign(3, 'tenant-a', Role.supervisor);
      await request(app.getHttpServer())
        .put('/anti-fatigue/rule')
        .set('Authorization', `Bearer ${token}`)
        .send({ windowHours: 12 })
        .expect(403);
    });

    it('digital pode ler dedupe-log mas não rule', async () => {
      const token = sign(4, 'tenant-a', Role.digital);
      await request(app.getHttpServer())
        .get('/anti-fatigue/dedupe-log')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/anti-fatigue/rule')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('rule lifecycle', () => {
    it('GET /rule cria com defaults', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/anti-fatigue/rule')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.tenantId).toBe('tenant-a');
      expect(res.body.enabled).toBe(true);
      expect(res.body.windowHours).toBe(24);
      expect(res.body.appliesTo).toBe('both');
      expect(res.body.businessHoursStart).toBeNull();
    });

    it('PUT /rule muda config', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .put('/anti-fatigue/rule')
        .set('Authorization', `Bearer ${token}`)
        .send({ windowHours: 12, appliesTo: 'phone' })
        .expect(200);
      expect(res.body.windowHours).toBe(12);
      expect(res.body.appliesTo).toBe('phone');
    });

    it('PUT /rule rejeita businessHours só com start ou só com end', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .put('/anti-fatigue/rule')
        .set('Authorization', `Bearer ${token}`)
        .send({ businessHoursStart: '08:00' })
        .expect(400);
    });

    it('PUT /rule aceita par válido de businessHours', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .put('/anti-fatigue/rule')
        .set('Authorization', `Bearer ${token}`)
        .send({ businessHoursStart: '08:00', businessHoursEnd: '20:00' })
        .expect(200);
      expect(res.body.businessHoursStart).toBe('08:00');
      expect(res.body.businessHoursEnd).toBe('20:00');
    });
  });

  describe('cross-tenant isolation', () => {
    it('PUT /rule de A não toca regra de B', async () => {
      const tokenA = sign(1, 'tenant-a', Role.admin);
      const tokenB = sign(2, 'tenant-b', Role.admin);

      // Cria regra B com window=72h
      await request(app.getHttpServer())
        .put('/anti-fatigue/rule')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ windowHours: 72 })
        .expect(200);

      // PUT em A com window=6h não deve afetar B
      await request(app.getHttpServer())
        .put('/anti-fatigue/rule')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ windowHours: 6 })
        .expect(200);

      const ruleB = store.rules.find((r) => r.tenantId === 'tenant-b')!;
      expect(ruleB.windowHours).toBe(72);
    });

    it('GET /dedupe-log de A NÃO mostra logs de B', async () => {
      // Insere log em B
      store.logs.push({
        id: 'l-secret-b',
        tenantId: 'tenant-b',
        contactKey: '5511999990000',
        channel: 'sms',
        blockedAt: new Date(),
        refType: 'JourneyRun',
        refId: 'secret-run-b',
      });

      const tokenA = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/anti-fatigue/dedupe-log')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const dump = JSON.stringify(res.body);
      expect(dump).not.toContain('secret-run-b');
      expect(dump).not.toContain('l-secret-b');
    });
  });

  describe('checkBeforeSend helper', () => {
    beforeEach(() => {
      // Reset regra de tenant-a: enabled, 24h window, no bypass, no business hours
      const r = store.rules.find((x) => x.tenantId === 'tenant-a');
      if (r) {
        r.enabled = true;
        r.windowHours = 24;
        r.allowBypassForUrgent = false;
        r.businessHoursStart = null;
        r.businessHoursEnd = null;
      }
      // Limpa logs do tenant-a
      const toKeep = store.logs.filter((l) => l.tenantId !== 'tenant-a');
      store.logs.length = 0;
      store.logs.push(...toKeep);
    });

    it('enabled=false ⇒ allowed sempre', async () => {
      const r = store.rules.find((x) => x.tenantId === 'tenant-a')!;
      r.enabled = false;
      const result = await service.checkBeforeSend(
        'tenant-a',
        '+5511999990000',
        'sms',
        'JourneyRun',
        'run-1',
      );
      expect(result.allowed).toBe(true);
    });

    it('primeiro send → allowed; segundo send mesmo contactKey/channel dentro da janela → bloqueia "window"', async () => {
      // Primeiro send
      const r1 = await service.checkBeforeSend(
        'tenant-a',
        '+5511999990000',
        'sms',
        'JourneyRun',
        'run-A',
      );
      expect(r1.allowed).toBe(true);

      // A Régua grava o sucesso
      await service.recordSend(
        'tenant-a',
        '+5511999990000',
        'sms',
        'JourneyRun',
        'run-A',
      );

      // Segundo send mesmo contato/canal dentro da janela
      const r2 = await service.checkBeforeSend(
        'tenant-a',
        '+5511999990000',
        'sms',
        'JourneyRun',
        'run-B',
      );
      expect(r2.allowed).toBe(false);
      expect((r2 as { allowed: false; reason: string }).reason).toBe('window');
    });

    it('contactKey diferente passa mesmo dentro da janela', async () => {
      await service.recordSend('tenant-a', '+5511999990000', 'sms', 'JourneyRun', 'run-A');
      const r = await service.checkBeforeSend(
        'tenant-a',
        '+5511888880000',
        'sms',
        'JourneyRun',
        'run-X',
      );
      expect(r.allowed).toBe(true);
    });

    it('channel diferente passa mesmo dentro da janela', async () => {
      await service.recordSend('tenant-a', '+5511999990000', 'sms', 'JourneyRun', 'run-A');
      const r = await service.checkBeforeSend(
        'tenant-a',
        '+5511999990000',
        'email',
        'JourneyRun',
        'run-X',
      );
      expect(r.allowed).toBe(true);
    });

    it('send antigo (fora da janela) NÃO bloqueia', async () => {
      const r = store.rules.find((x) => x.tenantId === 'tenant-a')!;
      r.windowHours = 1; // 1h
      // Insere log "antigo" (3h atrás)
      store.logs.push({
        id: 'l-old',
        tenantId: 'tenant-a',
        contactKey: '5511999990000', // já normalizado
        channel: 'sms',
        blockedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        refType: 'JourneyRun',
        refId: 'run-old',
      });
      const result = await service.checkBeforeSend(
        'tenant-a',
        '+5511999990000',
        'sms',
        'JourneyRun',
        'run-new',
      );
      expect(result.allowed).toBe(true);
    });

    it('allowBypassForUrgent + options.urgent ⇒ allowed dentro da janela', async () => {
      const r = store.rules.find((x) => x.tenantId === 'tenant-a')!;
      r.allowBypassForUrgent = true;
      await service.recordSend('tenant-a', '+5511999990000', 'sms', 'JourneyRun', 'run-A');
      const result = await service.checkBeforeSend(
        'tenant-a',
        '+5511999990000',
        'sms',
        'JourneyRun',
        'run-urgent',
        { urgent: true },
      );
      expect(result.allowed).toBe(true);
    });

    it('off-hours: janela 22:00-23:59 (UTC) bloqueia "off_hours" se agora estiver fora', async () => {
      const r = store.rules.find((x) => x.tenantId === 'tenant-a')!;
      // Define janela impossível: 00:00-00:01 UTC. A menos que o teste rode
      // exatamente no primeiro minuto do dia, isso vai bloquear.
      r.businessHoursStart = '00:00';
      r.businessHoursEnd = '00:01';

      const now = new Date();
      const currentHHMM = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
      const insideTinyWindow = currentHHMM >= '00:00' && currentHHMM < '00:01';

      const result = await service.checkBeforeSend(
        'tenant-a',
        '+5511777770000',
        'sms',
        'JourneyRun',
        'run-off',
      );
      if (insideTinyWindow) {
        expect(result.allowed).toBe(true);
      } else {
        expect(result.allowed).toBe(false);
        expect((result as { allowed: false; reason: string }).reason).toBe('off_hours');
      }
    });
  });
});
