import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type {
  PilotOverviewOrigin,
  PilotOverviewQueryDto,
} from './dto/pilot-overview-query.dto';

export interface PilotOverview {
  period: { from: string; to: string };
  origin: PilotOverviewOrigin;
  leadsIngested: number;
  conversationsCreated: number;
  botifyHandoffs: number;
  insightAnalyses: number;
  recoverableOpportunities: number;
  lossOrAbandonmentSignals: number;
  aiCost: { amount: number; currency: string };
}

const DEFAULT_DAYS = 30;
const SAMPLE_CAP = 5000;

// Intent canónico (PT) per docs/05-ai-governance.md (output JSON exemplo)
const MEDIUM_HIGH_INTENT = ['qualificado', 'quente', 'pronto_para_visita'];
// Risk canónico do schema (`ConversationAIAnalysis.risk`)
const HIGH_RISK = ['alto', 'critico'];

/**
 * Sprint Hub — PR 4 (A6 do piloto).
 *
 * Agrega métricas do funil piloto a partir das fontes existentes:
 *  - `IntegrationEvent` (provider='ads'|'bot', status='processed')
 *  - `Conversation`
 *  - `ConversationAIAnalysis` (campos `leadIntent`, `risk`, `lostOpportunity`,
 *    `hasLeadAbandonment`, `hasSellerAbandonment`)
 *  - `AIUsageLog` (`status='success'`, soma `estimatedCost`)
 *
 * Regra de recuperável simplificada (vs §4.2.1 do piloto): não correlaciona
 * com `CrmLead`/`CrmDeal` para evitar join cross-domínio; trabalha apenas
 * sobre `ConversationAIAnalysis`. Refinamento entra em PR posterior se o
 * piloto exigir.
 */
@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async pilotOverview(
    tenantId: string,
    q: PilotOverviewQueryDto,
  ): Promise<PilotOverview> {
    const { from, to } = this.resolveRange(q);
    const origin: PilotOverviewOrigin = q.origin ?? 'all';

    const adsFilter =
      origin === 'all' || origin === 'ads'
        ? { tenantId, provider: 'ads', status: 'processed', createdAt: { gte: from, lte: to } }
        : null;

    const [
      leadsIngested,
      conversationsCreated,
      botifyHandoffs,
      insightAnalyses,
      analyses,
      aiCostRows,
    ] = await Promise.all([
      adsFilter
        ? this.prisma.integrationEvent.count({ where: adsFilter })
        : Promise.resolve(0),
      this.prisma.conversation.count({
        where: { tenantId, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.integrationEvent.count({
        where: {
          tenantId,
          provider: 'bot',
          status: 'processed',
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.conversationAIAnalysis.count({
        where: { tenantId, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.conversationAIAnalysis.findMany({
        where: { tenantId, createdAt: { gte: from, lte: to } },
        select: {
          leadIntent: true,
          risk: true,
          lostOpportunity: true,
          hasLeadAbandonment: true,
          hasSellerAbandonment: true,
          nextBestAction: true,
        },
        take: SAMPLE_CAP,
      }),
      this.prisma.aIUsageLog.findMany({
        where: {
          tenantId,
          status: 'success',
          createdAt: { gte: from, lte: to },
        },
        select: { estimatedCost: true, currency: true },
      }),
    ]);

    const recoverableOpportunities = analyses.filter((a: typeof analyses[number]) =>
      this.isRecoverable(a),
    ).length;
    const lossOrAbandonmentSignals = analyses.filter(
      (a: typeof analyses[number]) =>
        a.lostOpportunity || a.hasLeadAbandonment || a.hasSellerAbandonment,
    ).length;

    const aiCost = this.summarizeCost(aiCostRows);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      origin,
      leadsIngested,
      conversationsCreated,
      botifyHandoffs,
      insightAnalyses,
      recoverableOpportunities,
      lossOrAbandonmentSignals,
      aiCost,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private resolveRange(q: PilotOverviewQueryDto): { from: Date; to: Date } {
    if (q.from && !q.to) throw new BadRequestException('`to` requires `from`');
    if (q.to && !q.from) throw new BadRequestException('`from` requires `to`');

    if (q.from && q.to) {
      const from = new Date(q.from);
      const to = new Date(q.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new BadRequestException('invalid date');
      }
      if (from > to) {
        throw new BadRequestException('`from` must be <= `to`');
      }
      return { from, to };
    }

    const days = q.days ?? DEFAULT_DAYS;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  private isRecoverable(a: {
    leadIntent: string;
    risk: string;
    lostOpportunity: boolean;
    nextBestAction: string;
  }): boolean {
    const intent = a.leadIntent?.toLowerCase() ?? '';
    if (!MEDIUM_HIGH_INTENT.includes(intent)) return false;

    if (a.lostOpportunity) return true;
    const risk = a.risk?.toLowerCase() ?? '';
    if (HIGH_RISK.includes(risk)) return true;
    if (this.looksLikeRecoveryAction(a.nextBestAction)) return true;
    return false;
  }

  /**
   * Heurística para "recovery/follow-up pattern" do §4.2.1. Bate em PT.
   * Intencional: heurística simples; calibrar conforme dados do piloto real.
   */
  private looksLikeRecoveryAction(text: string | null | undefined): boolean {
    if (!text) return false;
    const t = text.toLowerCase();
    return (
      t.includes('recupera') ||
      t.includes('reengaj') ||
      t.includes('follow-up') ||
      t.includes('followup') ||
      t.includes('retomar') ||
      t.includes('voltar a contactar') ||
      t.includes('voltar a contatar')
    );
  }

  private summarizeCost(
    rows: Array<{ estimatedCost: number; currency: string }>,
  ): { amount: number; currency: string } {
    if (rows.length === 0) return { amount: 0, currency: 'USD' };
    // Sum por moeda; reporta a moeda dominante. Se houver mistura, agrega
    // por moeda dominante e ignora o resto (raro hoje — AIUsageLog default
    // é USD). Refinamento (conversão FX p/ BRL) entra em PR posterior.
    const byCurrency = new Map<string, number>();
    for (const r of rows) {
      const cur = r.currency || 'USD';
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + (r.estimatedCost ?? 0));
    }
    let dominant: string = 'USD';
    let max = -Infinity;
    for (const [cur, total] of byCurrency) {
      if (total > max) {
        max = total;
        dominant = cur;
      }
    }
    return { amount: byCurrency.get(dominant) ?? 0, currency: dominant };
  }
}
