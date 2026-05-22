/**
 * Sprint Quick-wins — Q1.
 *
 * E2E tenant isolation + behavior for `/leads/360`. Cobre:
 *  - autenticação (todos os 5 roles autenticados podem ler)
 *  - tenant A nunca vê contatos/análises/CRM/conversas/handoffs de B
 *  - enrichment: match por phone com latest ConversationAIAnalysis +
 *    CrmLead + counts (conversation/analysis/handoff) + lastTouchAt
 *  - filtros: search, temperature, crm matched/unmatched
 *  - detail endpoint: timeline sorted DESC, todos os kinds presentes,
 *    cross-tenant 404
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { CrmLeadStage, CrmInteractionType, Role, Sender } from '@prisma/client';
import request from 'supertest';

import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma.service';
import { Leads360Controller } from '../leads-360/leads-360.controller';
import { Leads360Service } from '../leads-360/leads-360.service';

const JWT_SECRET = 'leads-360-e2e-secret';

interface ContactRow {
  id: number;
  tenantId: string;
  name: string;
  phone: string;
  segment: number | null;
  cpf: string | null;
  contract: string | null;
  isCPC: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AnalysisRow {
  id: number;
  tenantId: string;
  contactPhone: string;
  createdAt: Date;
  leadIntent: string;
  opportunityStatus: string;
  risk: string;
  mainObjection: string | null;
  qualificationScore: number;
  sellerQualityScore: number;
  lostOpportunity: boolean;
  nextBestAction: string;
  summary: string;
  modelProvider: string;
  modelName: string;
}

interface CrmLeadRow {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage: CrmLeadStage;
  brokerId: number | null;
  brokerName: string | null;
  estimatedValue: { toString: () => string } | null;
  propertyInterest: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ConvRow {
  id: number;
  tenantId: string;
  contactPhone: string;
  datetime: Date;
  sender: Sender;
  message: string;
  userName: string | null;
  messageType: string;
}

interface HandoffRow {
  id: number;
  tenantId: string;
  contactPhone: string;
  createdAt: Date;
  message: string;
  status: string;
  leadSummary: unknown;
}

interface InteractionRow {
  id: string;
  tenantId: string;
  leadId: string;
  type: CrmInteractionType;
  content: string | null;
  createdAt: Date;
}

function buildPrisma() {
  const now = new Date('2026-05-22T10:00:00Z');
  const earlier = new Date('2026-05-20T10:00:00Z');

  const users = [
    { id: 1, email: 'admin-a@a.com', name: 'Admin A', role: Role.admin },
    { id: 2, email: 'admin-b@b.com', name: 'Admin B', role: Role.admin },
    { id: 3, email: 'broker-a@a.com', name: 'Broker A', role: Role.broker },
  ];
  const userTenants = [
    { userId: 1, tenantId: 'tenant-a', role: Role.admin },
    { userId: 2, tenantId: 'tenant-b', role: Role.admin },
    { userId: 3, tenantId: 'tenant-a', role: Role.broker },
  ];

  const contacts: ContactRow[] = [
    {
      id: 1,
      tenantId: 'tenant-a',
      name: 'João da Silva',
      phone: '+5511999990001',
      segment: null,
      cpf: '12345678901',
      contract: null,
      isCPC: false,
      createdAt: earlier,
      updatedAt: earlier,
    },
    {
      id: 2,
      tenantId: 'tenant-a',
      name: 'Maria Souza',
      phone: '+5511999990002',
      segment: null,
      cpf: null,
      contract: null,
      isCPC: false,
      createdAt: earlier,
      updatedAt: earlier,
    },
    {
      id: 3,
      tenantId: 'tenant-a',
      name: 'Pedro Santos',
      phone: '+5511999990003',
      segment: null,
      cpf: null,
      contract: null,
      isCPC: false,
      createdAt: earlier,
      updatedAt: earlier,
    },
    {
      id: 99,
      tenantId: 'tenant-b',
      name: 'Tenant B Secret Contact',
      phone: '+5521888880000',
      segment: null,
      cpf: null,
      contract: null,
      isCPC: false,
      createdAt: earlier,
      updatedAt: earlier,
    },
  ];

  const analyses: AnalysisRow[] = [
    {
      id: 11,
      tenantId: 'tenant-a',
      contactPhone: '+5511999990001',
      createdAt: now,
      leadIntent: 'quente',
      opportunityStatus: 'ativa',
      risk: 'baixo',
      mainObjection: 'financiamento',
      qualificationScore: 78,
      sellerQualityScore: 70,
      lostOpportunity: false,
      nextBestAction: 'Agendar visita',
      summary: 'Lead muito interessado, pediu simulação',
      modelProvider: 'openai',
      modelName: 'gpt-4o-mini',
    },
    {
      id: 12,
      tenantId: 'tenant-a',
      contactPhone: '+5511999990002',
      createdAt: now,
      leadIntent: 'frio',
      opportunityStatus: 'em_avaliacao',
      risk: 'medio',
      mainObjection: null,
      qualificationScore: 30,
      sellerQualityScore: 60,
      lostOpportunity: false,
      nextBestAction: 'Nenhuma',
      summary: 'Sem interesse claro',
      modelProvider: 'heuristic',
      modelName: 'heuristic-v1',
    },
    // tenant-b — não deve vazar
    {
      id: 99,
      tenantId: 'tenant-b',
      contactPhone: '+5521888880000',
      createdAt: now,
      leadIntent: 'quente',
      opportunityStatus: 'ativa',
      risk: 'baixo',
      mainObjection: null,
      qualificationScore: 99,
      sellerQualityScore: 99,
      lostOpportunity: false,
      nextBestAction: 'SECRET-B',
      summary: 'SECRET-FROM-B',
      modelProvider: 'openai',
      modelName: 'gpt-4o',
    },
  ];

  const crmLeads: CrmLeadRow[] = [
    {
      id: 'crm-a-1',
      tenantId: 'tenant-a',
      name: 'João da Silva',
      phone: '+5511999990001',
      email: 'joao@example.com',
      source: 'meta-ads',
      stage: CrmLeadStage.contacted,
      brokerId: 3,
      brokerName: 'Broker A',
      estimatedValue: { toString: () => '500000.00' },
      propertyInterest: 'apartamento 2q',
      notes: null,
      createdAt: earlier,
      updatedAt: earlier,
    },
  ];

  const conversations: ConvRow[] = [
    {
      id: 100,
      tenantId: 'tenant-a',
      contactPhone: '+5511999990001',
      datetime: now,
      sender: Sender.contact,
      message: 'Quero saber sobre o apto',
      userName: null,
      messageType: 'text',
    },
    {
      id: 101,
      tenantId: 'tenant-a',
      contactPhone: '+5511999990001',
      datetime: new Date(earlier.getTime() + 1000),
      sender: Sender.operator,
      message: 'Boa tarde! Posso te ajudar',
      userName: 'Atendente X',
      messageType: 'text',
    },
  ];

  const handoffs: HandoffRow[] = [
    {
      id: 200,
      tenantId: 'tenant-a',
      contactPhone: '+5511999990001',
      createdAt: new Date(earlier.getTime() + 500),
      message: 'Handoff Botify → atendente',
      status: 'pending',
      leadSummary: { intent: 'compra' },
    },
  ];

  const interactions: InteractionRow[] = [
    {
      id: 'int-1',
      tenantId: 'tenant-a',
      leadId: 'crm-a-1',
      type: CrmInteractionType.note,
      content: 'Cliente pediu simulação',
      createdAt: now,
    },
  ];

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
    contact: {
      count: async ({ where }: any) =>
        contacts.filter((c) => matchContact(c, where)).length,
      findMany: async ({ where, take, skip, orderBy: _ob }: any) => {
        const filtered = contacts
          .filter((c) => matchContact(c, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return filtered.slice(skip ?? 0, (skip ?? 0) + (take ?? 25));
      },
      findFirst: async ({ where }: any) =>
        contacts.find((c) => matchContact(c, where)) ?? null,
    },
    conversationAIAnalysis: {
      findMany: async ({ where, orderBy: _ob, select: _sel, take }: any) => {
        let rows = analyses.filter(
          (a) =>
            a.tenantId === where.tenantId &&
            (where.contactPhone?.in
              ? where.contactPhone.in.includes(a.contactPhone)
              : where.contactPhone
                ? a.contactPhone === where.contactPhone
                : true),
        );
        rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) rows = rows.slice(0, take);
        return rows.map((r) => ({ ...r }));
      },
      findFirst: async ({ where, orderBy: _ob }: any) => {
        const rows = analyses.filter(
          (a) =>
            a.tenantId === where.tenantId &&
            (where.contactPhone ? a.contactPhone === where.contactPhone : true),
        );
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      },
    },
    crmLead: {
      findMany: async ({ where, select: _sel }: any) => {
        return crmLeads.filter(
          (l) =>
            l.tenantId === where.tenantId &&
            (where.phone?.in ? where.phone.in.includes(l.phone) : true),
        );
      },
      findFirst: async ({ where }: any) =>
        crmLeads.find(
          (l) =>
            l.tenantId === where.tenantId &&
            (where.id ? l.id === where.id : true),
        ) ?? null,
    },
    conversation: {
      groupBy: async ({ where }: any) => {
        const filtered = conversations.filter(
          (c) =>
            c.tenantId === where.tenantId &&
            (where.contactPhone?.in
              ? where.contactPhone.in.includes(c.contactPhone)
              : true),
        );
        const byPhone = new Map<string, ConvRow[]>();
        for (const c of filtered) {
          const arr = byPhone.get(c.contactPhone) ?? [];
          arr.push(c);
          byPhone.set(c.contactPhone, arr);
        }
        return [...byPhone.entries()].map(([contactPhone, rows]) => ({
          contactPhone,
          _count: { _all: rows.length },
          _max: {
            datetime: rows
              .map((r) => r.datetime)
              .sort((a, b) => b.getTime() - a.getTime())[0],
          },
        }));
      },
      findMany: async ({ where, take, orderBy: _ob, select: _sel }: any) => {
        let rows = conversations.filter(
          (c) =>
            c.tenantId === where.tenantId &&
            (where.contactPhone ? c.contactPhone === where.contactPhone : true),
        );
        rows = rows.sort((a, b) => b.datetime.getTime() - a.datetime.getTime());
        if (take) rows = rows.slice(0, take);
        return rows;
      },
    },
    messageQueue: {
      groupBy: async ({ where }: any) => {
        const filtered = handoffs.filter(
          (h) =>
            h.tenantId === where.tenantId &&
            (where.contactPhone?.in
              ? where.contactPhone.in.includes(h.contactPhone)
              : true),
        );
        const byPhone = new Map<string, HandoffRow[]>();
        for (const h of filtered) {
          const arr = byPhone.get(h.contactPhone) ?? [];
          arr.push(h);
          byPhone.set(h.contactPhone, arr);
        }
        return [...byPhone.entries()].map(([contactPhone, rows]) => ({
          contactPhone,
          _count: { _all: rows.length },
        }));
      },
      findMany: async ({ where, take }: any) => {
        let rows = handoffs.filter(
          (h) =>
            h.tenantId === where.tenantId &&
            (where.contactPhone ? h.contactPhone === where.contactPhone : true),
        );
        rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) rows = rows.slice(0, take);
        return rows;
      },
    },
    crmInteraction: {
      findMany: async ({ where, take, orderBy: _ob }: any) => {
        let rows = interactions.filter(
          (i) =>
            i.tenantId === where.tenantId &&
            (where.leadId ? i.leadId === where.leadId : true),
        );
        rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) rows = rows.slice(0, take);
        return rows;
      },
    },
  };

  function matchContact(c: ContactRow, where: any): boolean {
    if (c.tenantId !== where.tenantId) return false;
    if (where.id != null && c.id !== where.id) return false;
    if (where.OR) {
      const matches = where.OR.some((cond: any) => {
        if (cond.name?.contains) {
          return c.name.toLowerCase().includes(String(cond.name.contains).toLowerCase());
        }
        if (cond.phone?.contains) {
          return c.phone.includes(String(cond.phone.contains));
        }
        return false;
      });
      if (!matches) return false;
    }
    return true;
  }

  return {
    prisma,
    users,
    userTenants,
    contacts,
    analyses,
    crmLeads,
    conversations,
    handoffs,
    interactions,
  };
}

describe('Leads360 (E2E tenant isolation)', () => {
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
      controllers: [Leads360Controller],
      providers: [
        JwtStrategy,
        ConfigService,
        Leads360Service,
        { provide: PrismaService, useValue: store.prisma },
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

  it('exige autenticação', async () => {
    await request(app.getHttpServer()).get('/leads/360').expect(401);
  });

  describe('list', () => {
    it('admin de tenant A vê só contatos de A', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/leads/360')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.meta.total).toBe(3);
      const phones = (res.body.items as Array<{ phone: string }>).map((i) => i.phone);
      expect(phones).toContain('+5511999990001');
      expect(phones).not.toContain('+5521888880000');
      // PROVA: nada de tenant B vaza nem em metadata
      const dump = JSON.stringify(res.body);
      expect(dump).not.toContain('Tenant B Secret Contact');
      expect(dump).not.toContain('SECRET-FROM-B');
      expect(dump).not.toContain('SECRET-B');
    });

    it('enrichment: contato com análise quente vira temperature=hot + score', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/leads/360?search=jo%C3%A3o')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const joao = (res.body.items as Array<{ phone: string; temperature: string; qualificationScore: number; crmLeadId: string }>).find(
        (i) => i.phone === '+5511999990001',
      );
      expect(joao).toBeDefined();
      expect(joao!.temperature).toBe('hot');
      expect(joao!.qualificationScore).toBe(78);
      expect(joao!.crmLeadId).toBe('crm-a-1');
    });

    it('enrichment: contato sem análise vira temperature=unknown', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/leads/360?search=pedro')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const items = res.body.items as Array<{
        phone: string;
        temperature: string;
        analysisCount: number;
      }>;
      const pedro = items.find((i) => i.phone === '+5511999990003')!;
      expect(pedro.temperature).toBe('unknown');
      expect(pedro.analysisCount).toBe(0);
    });

    it('filtro temperature=hot retorna apenas quentes', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/leads/360?temperature=hot')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const items = res.body.items as Array<{ temperature: string; phone: string }>;
      expect(items.every((i) => i.temperature === 'hot')).toBe(true);
      expect(items.map((i) => i.phone)).toContain('+5511999990001');
    });

    it('filtro crm=unmatched retorna apenas contatos sem CrmLead', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/leads/360?crm=unmatched')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const items = res.body.items as Array<{ crmLeadId: string | null }>;
      expect(items.every((i) => i.crmLeadId === null)).toBe(true);
    });

    it('broker role acessa lista', async () => {
      const token = sign(3, 'tenant-a', Role.broker);
      await request(app.getHttpServer())
        .get('/leads/360')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('detail', () => {
    it('admin de A consegue ler detalhe do contato 1', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/leads/360/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.contactId).toBe(1);
      expect(res.body.name).toBe('João da Silva');
      expect(res.body.latestAnalysis).not.toBeNull();
      expect(res.body.latestAnalysis.qualificationScore).toBe(78);
      expect(res.body.crmLead).not.toBeNull();
      expect(res.body.crmLead.id).toBe('crm-a-1');
      // Timeline contém todos os kinds esperados
      const kinds = (res.body.timeline as Array<{ kind: string }>).map((t) => t.kind);
      expect(kinds).toContain('conversation');
      expect(kinds).toContain('analysis');
      expect(kinds).toContain('handoff');
      expect(kinds).toContain('crm_interaction');
      // Sort DESC por `at`
      const ats = (res.body.timeline as Array<{ at: string }>).map((t) => t.at);
      const sorted = [...ats].sort().reverse();
      expect(ats).toEqual(sorted);
    });

    it('admin de B NÃO consegue ler contato 1 de A (404)', async () => {
      const token = sign(2, 'tenant-b', Role.admin);
      await request(app.getHttpServer())
        .get('/leads/360/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('admin de A NÃO consegue ler contato 99 de B (404)', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      await request(app.getHttpServer())
        .get('/leads/360/99')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('detail de contato sem CrmLead nem análise volta tudo null', async () => {
      const token = sign(1, 'tenant-a', Role.admin);
      const res = await request(app.getHttpServer())
        .get('/leads/360/3')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.contactId).toBe(3);
      expect(res.body.latestAnalysis).toBeNull();
      expect(res.body.crmLead).toBeNull();
      expect(res.body.timeline).toEqual([]);
    });
  });
});
