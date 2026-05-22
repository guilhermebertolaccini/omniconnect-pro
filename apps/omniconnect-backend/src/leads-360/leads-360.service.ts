import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  LeadCrmFilter,
  LeadTemperatureFilter,
  ListLeads360QueryDto,
} from './dto/list-leads-360-query.dto';

/**
 * Temperatura derivada do `leadIntent` canônico
 * (ver `docs/05-ai-governance.md` — exemplo JSON do `ConversationAIResult`).
 */
const INTENT_TO_TEMPERATURE: Record<string, 'hot' | 'warm' | 'cold'> = {
  pronto_para_visita: 'hot',
  quente: 'hot',
  qualificado: 'warm',
  frio: 'cold',
};

export interface Lead360Summary {
  contactId: number;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  stage: string | null;
  brokerId: number | null;
  brokerName: string | null;
  crmLeadId: string | null;
  qualificationScore: number | null;
  leadIntent: string | null;
  temperature: 'hot' | 'warm' | 'cold' | 'unknown';
  lostOpportunity: boolean;
  mainObjection: string | null;
  nextBestAction: string | null;
  modelProvider: string | null;
  conversationCount: number;
  analysisCount: number;
  handoffCount: number;
  lastTouchAt: string | null;
  contactCreatedAt: string;
}

export interface Lead360DetailTimelineItem {
  kind: 'conversation' | 'analysis' | 'handoff' | 'crm_interaction';
  at: string;
  title: string;
  detail: string | null;
  meta?: Record<string, unknown>;
}

export interface Lead360Detail extends Lead360Summary {
  cpf: string | null;
  contract: string | null;
  segment: number | null;
  isCPC: boolean;
  contactUpdatedAt: string;
  crmLead: {
    id: string;
    estimatedValue: string | null;
    propertyInterest: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  latestAnalysis: {
    id: number;
    summary: string;
    leadIntent: string;
    opportunityStatus: string;
    risk: string;
    mainObjection: string | null;
    qualificationScore: number;
    sellerQualityScore: number;
    nextBestAction: string;
    modelProvider: string;
    modelName: string;
    createdAt: string;
  } | null;
  timeline: Lead360DetailTimelineItem[];
}

@Injectable()
export class Leads360Service {
  constructor(private readonly prisma: PrismaService) {}

  // ─── List (paginado) ─────────────────────────────────────────────────────

  async list(
    tenantId: string,
    query: ListLeads360QueryDto,
  ): Promise<{
    items: Lead360Summary[];
    meta: { total: number; limit: number; offset: number };
  }> {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    const searchFilter = this.buildSearchFilter(query.search);

    const where: Prisma.ContactWhereInput = {
      tenantId,
      ...searchFilter,
    };

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.contact.count({ where }),
    ]);

    if (contacts.length === 0) {
      return { items: [], meta: { total, limit, offset } };
    }

    const phones = contacts.map((c) => c.phone);
    const summaries = await this.enrich(tenantId, contacts, phones);

    // Aplica filtros de temperatura + CRM + broker AGORA (pós-enrichment),
    // antes de paginar — para Phase 1 isso é aceitável porque mesmo a
    // página inteira tem no máx. 200 linhas. Refinar com SQL puro entra
    // numa PR posterior se a página esticar.
    const filtered = summaries.filter((s) => {
      if (query.temperature && query.temperature !== LeadTemperatureFilter.unknown) {
        if (s.temperature !== query.temperature) return false;
      }
      if (query.temperature === LeadTemperatureFilter.unknown && s.temperature !== 'unknown') {
        return false;
      }
      if (query.crm === LeadCrmFilter.matched && !s.crmLeadId) return false;
      if (query.crm === LeadCrmFilter.unmatched && s.crmLeadId) return false;
      if (query.brokerId != null && s.brokerId !== query.brokerId) return false;
      return true;
    });

    return { items: filtered, meta: { total, limit, offset } };
  }

  // ─── Detail ──────────────────────────────────────────────────────────────

  async findOne(tenantId: string, contactId: number): Promise<Lead360Detail> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
    });
    if (!contact) {
      throw new NotFoundException('Lead 360° não encontrado para este tenant');
    }

    const [summaryArr] = await Promise.all([
      this.enrich(tenantId, [contact], [contact.phone]),
    ]);
    const base = summaryArr[0];

    const [latestAnalysis, crmLeadFull, allConversations, allAnalyses, allHandoffs, allInteractions] =
      await Promise.all([
        this.prisma.conversationAIAnalysis.findFirst({
          where: { tenantId, contactPhone: contact.phone },
          orderBy: { createdAt: 'desc' },
        }),
        base.crmLeadId
          ? this.prisma.crmLead.findFirst({
              where: { id: base.crmLeadId, tenantId },
            })
          : Promise.resolve(null),
        this.prisma.conversation.findMany({
          where: { tenantId, contactPhone: contact.phone },
          orderBy: { datetime: 'desc' },
          take: 50,
          select: {
            id: true,
            datetime: true,
            sender: true,
            message: true,
            userName: true,
            messageType: true,
          },
        }),
        this.prisma.conversationAIAnalysis.findMany({
          where: { tenantId, contactPhone: contact.phone },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            createdAt: true,
            leadIntent: true,
            qualificationScore: true,
            summary: true,
            nextBestAction: true,
            modelProvider: true,
          },
        }),
        this.prisma.messageQueue.findMany({
          where: { tenantId, contactPhone: contact.phone },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            createdAt: true,
            message: true,
            status: true,
            leadSummary: true,
          },
        }),
        base.crmLeadId
          ? this.prisma.crmInteraction.findMany({
              where: { tenantId, leadId: base.crmLeadId },
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: {
                id: true,
                createdAt: true,
                type: true,
                content: true,
              },
            })
          : Promise.resolve([] as Array<{
              id: string;
              createdAt: Date;
              type: string;
              content: string | null;
            }>),
      ]);

    const timeline = this.buildTimeline(
      allConversations,
      allAnalyses,
      allHandoffs,
      allInteractions,
    );

    return {
      ...base,
      cpf: contact.cpf,
      contract: contact.contract,
      segment: contact.segment,
      isCPC: contact.isCPC,
      contactUpdatedAt: contact.updatedAt.toISOString(),
      crmLead: crmLeadFull
        ? {
            id: crmLeadFull.id,
            estimatedValue:
              crmLeadFull.estimatedValue !== null
                ? crmLeadFull.estimatedValue.toString()
                : null,
            propertyInterest: crmLeadFull.propertyInterest,
            notes: crmLeadFull.notes,
            createdAt: crmLeadFull.createdAt.toISOString(),
            updatedAt: crmLeadFull.updatedAt.toISOString(),
          }
        : null,
      latestAnalysis: latestAnalysis
        ? {
            id: latestAnalysis.id,
            summary: latestAnalysis.summary,
            leadIntent: latestAnalysis.leadIntent,
            opportunityStatus: latestAnalysis.opportunityStatus,
            risk: latestAnalysis.risk,
            mainObjection: latestAnalysis.mainObjection,
            qualificationScore: latestAnalysis.qualificationScore,
            sellerQualityScore: latestAnalysis.sellerQualityScore,
            nextBestAction: latestAnalysis.nextBestAction,
            modelProvider: latestAnalysis.modelProvider,
            modelName: latestAnalysis.modelName,
            createdAt: latestAnalysis.createdAt.toISOString(),
          }
        : null,
      timeline,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private buildSearchFilter(search?: string): Prisma.ContactWhereInput {
    if (!search) return {};
    const s = search.trim();
    if (!s) return {};
    return {
      OR: [
        { name: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
      ],
    };
  }

  private async enrich(
    tenantId: string,
    contacts: Array<{
      id: number;
      name: string;
      phone: string;
      segment: number | null;
      cpf: string | null;
      contract: string | null;
      isCPC: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>,
    phones: string[],
  ): Promise<Lead360Summary[]> {
    if (phones.length === 0) return [];

    // Latest analysis por telefone — uma query, group depois em memória.
    const latestAnalyses = await this.prisma.conversationAIAnalysis.findMany({
      where: { tenantId, contactPhone: { in: phones } },
      orderBy: { createdAt: 'desc' },
      select: {
        contactPhone: true,
        createdAt: true,
        leadIntent: true,
        qualificationScore: true,
        lostOpportunity: true,
        mainObjection: true,
        nextBestAction: true,
        modelProvider: true,
      },
    });
    const analysisByPhone = new Map<
      string,
      {
        createdAt: Date;
        leadIntent: string;
        qualificationScore: number;
        lostOpportunity: boolean;
        mainObjection: string | null;
        nextBestAction: string;
        modelProvider: string;
      }
    >();
    for (const a of latestAnalyses) {
      if (!analysisByPhone.has(a.contactPhone)) {
        analysisByPhone.set(a.contactPhone, {
          createdAt: a.createdAt,
          leadIntent: a.leadIntent,
          qualificationScore: a.qualificationScore,
          lostOpportunity: a.lostOpportunity,
          mainObjection: a.mainObjection,
          nextBestAction: a.nextBestAction,
          modelProvider: a.modelProvider,
        });
      }
    }
    const analysisCountByPhone = latestAnalyses.reduce<Map<string, number>>(
      (acc, row) => {
        acc.set(row.contactPhone, (acc.get(row.contactPhone) ?? 0) + 1);
        return acc;
      },
      new Map(),
    );

    // CRM leads por telefone
    const crmLeads = await this.prisma.crmLead.findMany({
      where: { tenantId, phone: { in: phones } },
      select: {
        id: true,
        phone: true,
        email: true,
        source: true,
        stage: true,
        brokerId: true,
        brokerName: true,
      },
    });
    const crmByPhone = new Map<
      string,
      {
        id: string;
        email: string | null;
        source: string | null;
        stage: string;
        brokerId: number | null;
        brokerName: string | null;
      }
    >();
    for (const c of crmLeads) {
      if (c.phone && !crmByPhone.has(c.phone)) {
        crmByPhone.set(c.phone, {
          id: c.id,
          email: c.email,
          source: c.source,
          stage: c.stage,
          brokerId: c.brokerId,
          brokerName: c.brokerName,
        });
      }
    }

    // Conversation count + lastTouch
    const convGrouped = await this.prisma.conversation.groupBy({
      by: ['contactPhone'],
      where: { tenantId, contactPhone: { in: phones } },
      _count: { _all: true },
      _max: { datetime: true },
    });
    const convByPhone = new Map<string, { count: number; lastAt: Date | null }>();
    for (const g of convGrouped) {
      convByPhone.set(g.contactPhone, {
        count: g._count._all,
        lastAt: g._max.datetime,
      });
    }

    // Handoff count (MessageQueue)
    const handoffGrouped = await this.prisma.messageQueue.groupBy({
      by: ['contactPhone'],
      where: { tenantId, contactPhone: { in: phones } },
      _count: { _all: true },
    });
    const handoffByPhone = new Map<string, number>();
    for (const g of handoffGrouped) {
      handoffByPhone.set(g.contactPhone, g._count._all);
    }

    return contacts.map((contact) => {
      const analysis = analysisByPhone.get(contact.phone) ?? null;
      const crm = crmByPhone.get(contact.phone) ?? null;
      const conv = convByPhone.get(contact.phone) ?? { count: 0, lastAt: null };
      const handoffCount = handoffByPhone.get(contact.phone) ?? 0;

      const intent = analysis?.leadIntent?.toLowerCase() ?? null;
      const temperature: Lead360Summary['temperature'] = intent
        ? (INTENT_TO_TEMPERATURE[intent] ?? 'unknown')
        : 'unknown';

      const lastTouchCandidates: Array<Date | null> = [
        conv.lastAt,
        analysis?.createdAt ?? null,
      ];
      const lastTouchAt = lastTouchCandidates
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: crm?.email ?? null,
        source: crm?.source ?? null,
        stage: crm?.stage ?? null,
        brokerId: crm?.brokerId ?? null,
        brokerName: crm?.brokerName ?? null,
        crmLeadId: crm?.id ?? null,
        qualificationScore: analysis?.qualificationScore ?? null,
        leadIntent: analysis?.leadIntent ?? null,
        temperature,
        lostOpportunity: analysis?.lostOpportunity ?? false,
        mainObjection: analysis?.mainObjection ?? null,
        nextBestAction: analysis?.nextBestAction ?? null,
        modelProvider: analysis?.modelProvider ?? null,
        conversationCount: conv.count,
        analysisCount: analysisCountByPhone.get(contact.phone) ?? 0,
        handoffCount,
        lastTouchAt: lastTouchAt ? lastTouchAt.toISOString() : null,
        contactCreatedAt: contact.createdAt.toISOString(),
      };
    });
  }

  private buildTimeline(
    conversations: Array<{
      id: number;
      datetime: Date;
      sender: string;
      message: string;
      userName: string | null;
      messageType: string;
    }>,
    analyses: Array<{
      id: number;
      createdAt: Date;
      leadIntent: string;
      qualificationScore: number;
      summary: string;
      nextBestAction: string;
      modelProvider: string;
    }>,
    handoffs: Array<{
      id: number;
      createdAt: Date;
      message: string;
      status: string;
      leadSummary: Prisma.JsonValue;
    }>,
    interactions: Array<{
      id: string;
      createdAt: Date;
      type: string;
      content: string | null;
    }>,
  ): Lead360DetailTimelineItem[] {
    const items: Lead360DetailTimelineItem[] = [];

    for (const c of conversations) {
      items.push({
        kind: 'conversation',
        at: c.datetime.toISOString(),
        title:
          c.sender === 'contact'
            ? 'Contato enviou mensagem'
            : `Atendente ${c.userName ?? ''} respondeu`.trim(),
        detail: c.message.slice(0, 280),
        meta: { conversationId: c.id, messageType: c.messageType, sender: c.sender },
      });
    }

    for (const a of analyses) {
      items.push({
        kind: 'analysis',
        at: a.createdAt.toISOString(),
        title: `Análise IA (${a.modelProvider}) — intent: ${a.leadIntent}`,
        detail: `${a.summary.slice(0, 240)}${a.summary.length > 240 ? '…' : ''}`,
        meta: {
          analysisId: a.id,
          qualificationScore: a.qualificationScore,
          nextBestAction: a.nextBestAction,
        },
      });
    }

    for (const h of handoffs) {
      items.push({
        kind: 'handoff',
        at: h.createdAt.toISOString(),
        title: 'Handoff Botify',
        detail: h.message.slice(0, 240),
        meta: { messageQueueId: h.id, status: h.status, leadSummary: h.leadSummary },
      });
    }

    for (const i of interactions) {
      items.push({
        kind: 'crm_interaction',
        at: i.createdAt.toISOString(),
        title: `Interação CRM (${i.type})`,
        detail: (i.content ?? '').slice(0, 240) || null,
        meta: { interactionId: i.id, type: i.type },
      });
    }

    return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
}
