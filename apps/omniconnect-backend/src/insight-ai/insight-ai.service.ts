import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { AnalyzeConversationDto } from './dto/analyze-conversation.dto';
import { buildConversationAnalysisPrompt } from './insight-ai.prompt';
import { ConversationAIResult, NormalizedMessage } from '@omniconnect/ai-contracts';

@Injectable()
export class InsightAiService {
  private readonly logger = new Logger(InsightAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async analyzeByPhone(contactPhone: string, dto: AnalyzeConversationDto = {}) {
    const limit = dto.limit ?? 80;
    const days = dto.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const conversations = await this.prisma.conversation.findMany({
      where: {
        contactPhone,
        datetime: { gte: since },
        ...(dto.segment ? { segment: dto.segment } : {}),
        ...(dto.userId ? { userId: dto.userId } : {}),
      },
      orderBy: { datetime: 'asc' },
      take: limit,
      select: {
        id: true,
        contactName: true,
        contactPhone: true,
        segment: true,
        userName: true,
        userId: true,
        message: true,
        sender: true,
        datetime: true,
      },
    });

    if (!conversations.length) {
      throw new BadRequestException('Nenhuma conversa encontrada para análise.');
    }

    const messages: NormalizedMessage[] = conversations.map((c) => ({
      id: c.id,
      sender: c.sender,
      text: c.message,
      datetime: c.datetime,
      userId: c.userId,
      userName: c.userName,
    }));

    const result = await this.analyzeMessages(messages);
    const first = conversations[0];
    const last = conversations[conversations.length - 1];

    if (dto.persist !== false) {
      await this.persistAnalysis({
        contactPhone,
        contactName: first.contactName,
        segment: first.segment,
        userId: last.userId ?? first.userId,
        userName: last.userName ?? first.userName,
        conversationStart: first.datetime,
        conversationEnd: last.datetime,
        messageCount: conversations.length,
        result,
      });
    }

    return {
      contactPhone,
      contactName: first.contactName,
      segment: first.segment,
      userId: last.userId ?? first.userId,
      userName: last.userName ?? first.userName,
      conversationStart: first.datetime,
      conversationEnd: last.datetime,
      messageCount: conversations.length,
      analysis: result,
    };
  }

  async analyzeManyPending(dto: AnalyzeConversationDto = {}) {
    const days = dto.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const phones = await this.prisma.conversation.findMany({
      where: {
        datetime: { gte: since },
        ...(dto.segment ? { segment: dto.segment } : {}),
        ...(dto.userId ? { userId: dto.userId } : {}),
      },
      distinct: ['contactPhone'],
      orderBy: { datetime: 'desc' },
      take: dto.limit ?? 20,
      select: { contactPhone: true },
    });

    const results = [];
    for (const item of phones) {
      try {
        results.push(await this.analyzeByPhone(item.contactPhone, dto));
      } catch (error) {
        this.logger.warn(`Falha ao analisar ${item.contactPhone}: ${error?.message ?? error}`);
      }
    }

    return { total: results.length, results };
  }

  async listAnalyses(filters: { contactPhone?: string; limit?: number }) {
    const limit = Math.min(filters.limit ?? 50, 200);
    return (this.prisma as any).conversationAIAnalysis.findMany({
      where: filters.contactPhone ? { contactPhone: filters.contactPhone } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getExecutiveSummary(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await (this.prisma as any).conversationAIAnalysis.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const count = rows.length;
    const avg = (field: string) => count ? Math.round(rows.reduce((sum, r) => sum + (Number(r[field]) || 0), 0) / count) : 0;
    const group = (field: string) => rows.reduce((acc, r) => {
      const key = r[field] ?? 'indefinido';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      periodDays: days,
      analyzedConversations: count,
      averageSellerQualityScore: avg('sellerQualityScore'),
      averageResponseQualityScore: avg('responseQualityScore'),
      averageQualificationScore: avg('qualificationScore'),
      averageFollowUpScore: avg('followUpScore'),
      lostOpportunities: rows.filter((r) => r.lostOpportunity).length,
      sellerAbandonments: rows.filter((r) => r.hasSellerAbandonment).length,
      leadAbandonments: rows.filter((r) => r.hasLeadAbandonment).length,
      schedulingAttempts: rows.filter((r) => r.hasSchedulingAttempt).length,
      proposalOrSimulationAttempts: rows.filter((r) => r.hasProposalOrSimulationAttempt).length,
      byLeadIntent: group('leadIntent'),
      byOpportunityStatus: group('opportunityStatus'),
      byRisk: group('risk'),
      topObjections: this.topObjections(rows),
    };
  }

  private async analyzeMessages(messages: NormalizedMessage[]): Promise<ConversationAIResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return this.heuristicAnalysis(messages);
    }

    try {
      return await this.openAiAnalysis(messages, apiKey);
    } catch (error) {
      this.logger.warn(`OpenAI indisponível. Usando análise heurística. Erro: ${error?.message ?? error}`);
      return this.heuristicAnalysis(messages);
    }
  }

  private async openAiAnalysis(messages: NormalizedMessage[], apiKey: string): Promise<ConversationAIResult> {
    const model = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    const prompt = buildConversationAnalysisPrompt(messages);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Você é um analista sênior de conversão comercial imobiliária. Responda somente JSON válido.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da OpenAI.');

    return this.normalizeResult(JSON.parse(content));
  }

  private heuristicAnalysis(messages: NormalizedMessage[]): ConversationAIResult {
    const allText = messages.map((m) => m.text.toLowerCase()).join(' ');
    const contactMessages = messages.filter((m) => m.sender === 'contact');
    const operatorMessages = messages.filter((m) => m.sender === 'operator');
    const firstContact = contactMessages[0];
    const firstOperatorAfterContact = firstContact
      ? operatorMessages.find((m) => new Date(m.datetime).getTime() >= new Date(firstContact.datetime).getTime())
      : undefined;

    const firstResponseMinutes = firstContact && firstOperatorAfterContact
      ? Math.max(0, Math.round((new Date(firstOperatorAfterContact.datetime).getTime() - new Date(firstContact.datetime).getTime()) / 60000))
      : null;

    const objectionMap: Record<string, string[]> = {
      preco: ['preço', 'valor', 'caro', 'entrada', 'parcela'],
      financiamento: ['financiamento', 'financiar', 'banco', 'renda', 'aprovação'],
      localizacao: ['localização', 'bairro', 'longe', 'região', 'zona'],
      prazo: ['entrega', 'prazo', 'pronto', 'obra'],
      documentacao: ['documento', 'documentação', 'contrato'],
    };

    const objections = Object.entries(objectionMap)
      .filter(([, terms]) => terms.some((term) => allText.includes(term)))
      .map(([name]) => name);

    const hasSchedulingAttempt = ['visita', 'agendar', 'agenda', 'conhecer', 'decorado'].some((t) => allText.includes(t));
    const hasProposalOrSimulationAttempt = ['simulação', 'simular', 'proposta', 'condição', 'fluxo de pagamento'].some((t) => allText.includes(t));
    const hasQualification = ['renda', 'financiamento', 'prazo', 'região', 'dormitório', 'quartos', 'entrada'].some((t) => allText.includes(t));
    const hasSellerAbandonment = messages.length > 1 && messages[messages.length - 1].sender === 'contact';
    const hasLeadAbandonment = messages.length > 1 && messages[messages.length - 1].sender === 'operator';

    const intentScore =
      (allText.includes('visita') ? 25 : 0) +
      (allText.includes('proposta') || allText.includes('simulação') ? 25 : 0) +
      (allText.includes('preço') || allText.includes('valor') ? 15 : 0) +
      (hasQualification ? 20 : 0) +
      (contactMessages.length >= 3 ? 15 : 0);

    const leadIntent = intentScore >= 75 ? 'quente' : intentScore >= 50 ? 'qualificado' : intentScore >= 25 ? 'pesquisa' : 'indefinido';
    const sellerQualityScore = Math.min(100, 35 + (hasQualification ? 20 : 0) + (hasSchedulingAttempt ? 20 : 0) + (hasProposalOrSimulationAttempt ? 15 : 0) + (firstResponseMinutes !== null && firstResponseMinutes <= 10 ? 10 : 0) - (hasSellerAbandonment ? 20 : 0));
    const lostOpportunity = intentScore >= 50 && hasSellerAbandonment;

    return this.normalizeResult({
      summary: `Conversa analisada automaticamente com ${messages.length} mensagens. Intenção estimada: ${leadIntent}.`,
      leadIntent,
      opportunityStatus: lostOpportunity ? 'pronta_para_retomada' : hasSellerAbandonment ? 'em_risco' : 'ativa',
      risk: lostOpportunity ? 'alto' : hasSellerAbandonment ? 'medio' : 'baixo',
      mainObjection: objections[0] ?? null,
      objections,
      sellerQualityScore,
      responseQualityScore: firstResponseMinutes === null ? 40 : firstResponseMinutes <= 10 ? 90 : firstResponseMinutes <= 60 ? 70 : 45,
      qualificationScore: hasQualification ? 80 : 35,
      followUpScore: hasLeadAbandonment ? 70 : 35,
      firstResponseMinutes,
      hasSellerAbandonment,
      hasLeadAbandonment,
      hasQualification,
      hasSchedulingAttempt,
      hasProposalOrSimulationAttempt,
      lostOpportunity,
      nextBestAction: lostOpportunity
        ? 'Retomar contato com abordagem consultiva, recuperar contexto da conversa e propor próximo passo objetivo.'
        : 'Manter acompanhamento e conduzir para agendamento, simulação ou proposta conforme o estágio do lead.',
      evidence: [
        hasQualification ? 'Foram encontrados sinais de qualificação na conversa.' : 'Não foram encontrados sinais suficientes de qualificação.',
        hasSchedulingAttempt ? 'Há tentativa ou menção de agendamento/visita.' : 'Não há tentativa clara de agendamento.',
        objections.length ? `Objeções detectadas: ${objections.join(', ')}.` : 'Nenhuma objeção dominante detectada.',
      ],
      metrics: { heuristic: true, contactMessages: contactMessages.length, operatorMessages: operatorMessages.length, intentScore },
    });
  }

  private normalizeResult(input: any): ConversationAIResult {
    const clamp = (n: any) => Math.max(0, Math.min(100, Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0));
    return {
      summary: String(input.summary ?? ''),
      leadIntent: input.leadIntent ?? 'indefinido',
      opportunityStatus: input.opportunityStatus ?? 'sem_oportunidade_clara',
      risk: input.risk ?? 'medio',
      mainObjection: input.mainObjection ?? null,
      objections: Array.isArray(input.objections) ? input.objections.map(String) : [],
      sellerQualityScore: clamp(input.sellerQualityScore),
      responseQualityScore: clamp(input.responseQualityScore),
      qualificationScore: clamp(input.qualificationScore),
      followUpScore: clamp(input.followUpScore),
      firstResponseMinutes: input.firstResponseMinutes === null || input.firstResponseMinutes === undefined ? null : Number(input.firstResponseMinutes),
      hasSellerAbandonment: Boolean(input.hasSellerAbandonment),
      hasLeadAbandonment: Boolean(input.hasLeadAbandonment),
      hasQualification: Boolean(input.hasQualification),
      hasSchedulingAttempt: Boolean(input.hasSchedulingAttempt),
      hasProposalOrSimulationAttempt: Boolean(input.hasProposalOrSimulationAttempt),
      lostOpportunity: Boolean(input.lostOpportunity),
      nextBestAction: String(input.nextBestAction ?? ''),
      evidence: Array.isArray(input.evidence) ? input.evidence.slice(0, 5).map(String) : [],
      metrics: typeof input.metrics === 'object' && input.metrics ? input.metrics : {},
    };
  }

  private async persistAnalysis(payload: {
    contactPhone: string;
    contactName?: string | null;
    segment?: number | null;
    userId?: number | null;
    userName?: string | null;
    conversationStart: Date;
    conversationEnd: Date;
    messageCount: number;
    result: ConversationAIResult;
  }) {
    const r = payload.result;
    return (this.prisma as any).conversationAIAnalysis.create({
      data: {
        contactPhone: payload.contactPhone,
        contactName: payload.contactName,
        segment: payload.segment,
        userId: payload.userId,
        userName: payload.userName,
        conversationStart: payload.conversationStart,
        conversationEnd: payload.conversationEnd,
        messageCount: payload.messageCount,
        summary: r.summary,
        leadIntent: r.leadIntent,
        opportunityStatus: r.opportunityStatus,
        risk: r.risk,
        mainObjection: r.mainObjection,
        objections: JSON.stringify(r.objections),
        sellerQualityScore: r.sellerQualityScore,
        responseQualityScore: r.responseQualityScore,
        qualificationScore: r.qualificationScore,
        followUpScore: r.followUpScore,
        firstResponseMinutes: r.firstResponseMinutes,
        hasSellerAbandonment: r.hasSellerAbandonment,
        hasLeadAbandonment: r.hasLeadAbandonment,
        hasQualification: r.hasQualification,
        hasSchedulingAttempt: r.hasSchedulingAttempt,
        hasProposalOrSimulationAttempt: r.hasProposalOrSimulationAttempt,
        lostOpportunity: r.lostOpportunity,
        nextBestAction: r.nextBestAction,
        evidence: JSON.stringify(r.evidence),
        metrics: JSON.stringify(r.metrics),
        rawResult: JSON.stringify(r),
      },
    });
  }

  private topObjections(rows: any[]) {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      try {
        const items = JSON.parse(row.objections || '[]');
        for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
      } catch {
        // ignore invalid JSON
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([objection, count]) => ({ objection, count }));
  }
}
