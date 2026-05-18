import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { ModelPricingService } from '../model-pricing/model-pricing.service';
import { AnalyzeConversationDto } from './dto/analyze-conversation.dto';
import { buildConversationAnalysisPrompt, PROMPT_VERSION } from './insight-ai.prompt';
import { ConversationAIResult, NormalizedMessage } from '@omniconnect/ai-contracts';
import { redactPII } from './pii-redactor.util';

interface EnqueueResult {
  jobId: string;
  tenantId: string;
  contactPhone: string;
  status: 'queued';
}

interface JobStatusResult {
  jobId: string;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'delayed' | 'waiting' | 'paused' | 'stuck' | 'unknown';
  result?: unknown;
  failedReason?: string;
  attemptsMade?: number;
}

@Injectable()
export class InsightAiService {
  private readonly logger = new Logger(InsightAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly pricing: ModelPricingService,
    @InjectQueue('insight-ai') private readonly queue: Queue,
  ) {}

  /**
   * Enqueue a conversation analysis. Returns the jobId so the caller
   * can poll via getJobStatus().
   *
   * Job IDs are deterministic: `iai:<sha256(tenantId|phone|days|limit|hourBucket)>`.
   * Two reasons:
   *   - Deduplication: Bull treats `jobId` as a uniqueness key — if a
   *     job with the same id is in waiting/active/delayed state the
   *     queue keeps the original instead of stacking duplicates. This
   *     was promised in the previous code via a comment but never
   *     actually implemented (no `jobId` was passed).
   *   - Privacy: hashing the inputs means the raw phone number is
   *     never written into Redis. The bucket is the current UTC hour,
   *     which strikes a balance between "re-analyze if the user
   *     retries 30s later" (same id, dedup wins) and "re-run cleanly
   *     after an hour" (different id, re-runs fine).
   */
  async enqueueAnalyzeByPhone(
    tenantId: string,
    contactPhone: string,
    dto: AnalyzeConversationDto = {},
  ): Promise<EnqueueResult> {
    const jobId = this.buildAnalyzeJobId(tenantId, contactPhone, dto);
    const job = await this.queue.add(
      'analyze-conversation',
      { tenantId, contactPhone, dto },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    );
    return {
      jobId: String(job.id),
      tenantId,
      contactPhone,
      status: 'queued',
    };
  }

  /**
   * Inspect a previously enqueued job. Strictly scoped to tenantId: a
   * job whose data does NOT carry a tenantId is treated as if it did
   * not exist (defense in depth — malformed/legacy payloads cannot be
   * cross-read), and a job whose tenantId differs from the caller's is
   * a 404, not a 403, so we do not leak job existence across tenants.
   */
  async getJobStatus(tenantId: string, jobId: string): Promise<JobStatusResult> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    const jobTenantId = (job.data as { tenantId?: unknown } | null)?.tenantId;
    if (!jobTenantId || jobTenantId !== tenantId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    const state = (await job.getState()) as JobStatusResult['status'];
    return {
      jobId: String(job.id),
      status: state ?? 'unknown',
      result: job.returnvalue ?? undefined,
      failedReason: job.failedReason ?? undefined,
      attemptsMade: job.attemptsMade,
    };
  }

  /**
   * Hash-derived job id, exported for tests. The hour bucket scopes
   * dedup to ~1h windows so retries within the same hour collapse but
   * re-runs the next hour proceed normally.
   */
  buildAnalyzeJobId(
    tenantId: string,
    contactPhone: string,
    dto: AnalyzeConversationDto,
  ): string {
    const days = dto.days ?? 30;
    const limit = dto.limit ?? 80;
    const segment = dto.segment ?? '';
    const userId = dto.userId ?? '';
    const bucket = Math.floor(Date.now() / (60 * 60 * 1000));
    const material = `${tenantId}|${contactPhone}|${days}|${limit}|${segment}|${userId}|${bucket}`;
    const digest = crypto.createHash('sha256').update(material).digest('hex');
    return `iai:${digest}`;
  }

  async analyzeByPhone(tenantId: string, contactPhone: string, dto: AnalyzeConversationDto = {}) {
    const limit = dto.limit ?? 80;
    const days = dto.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const conversations = await this.prisma.conversation.findMany({
      where: {
        tenantId,
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

    const first = conversations[0];
    const last = conversations[conversations.length - 1];

    const response = await this.analyzeMessages(tenantId, first.id, messages);
    const result = response.result;

    let persistedAnalysisId: number | null = null;
    if (dto.persist !== false) {
      const persisted = await this.persistAnalysis(tenantId, {
        contactPhone,
        contactName: first.contactName,
        segment: first.segment,
        userId: last.userId ?? first.userId,
        userName: last.userName ?? first.userName,
        conversationStart: first.datetime,
        conversationEnd: last.datetime,
        messageCount: conversations.length,
        result,
        modelProvider: response.modelProvider,
        modelName: response.modelName,
        promptVersion: response.promptVersion,
      });
      persistedAnalysisId = persisted.id;
      if (response.usageLogId && persistedAnalysisId) {
        await this.prisma.aIUsageLog
          .update({ where: { id: response.usageLogId }, data: { analysisId: persistedAnalysisId } })
          .catch((err) => this.logger.warn(`Failed to attach analysisId to usage log: ${err?.message}`));
      }
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
      analysisId: persistedAnalysisId,
    };
  }

  async analyzeManyPending(tenantId: string, dto: AnalyzeConversationDto = {}) {
    const days = dto.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const phones = await this.prisma.conversation.findMany({
      where: {
        tenantId,
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
        results.push(await this.analyzeByPhone(tenantId, item.contactPhone, dto));
      } catch (error) {
        this.logger.warn(`Falha ao analisar ${item.contactPhone}: ${(error as Error)?.message ?? error}`);
      }
    }

    return { total: results.length, results };
  }

  async listAnalyses(tenantId: string, filters: { contactPhone?: string; limit?: number }) {
    const limit = Math.min(filters.limit ?? 50, 200);
    return this.prisma.conversationAIAnalysis.findMany({
      where: { tenantId, ...(filters.contactPhone ? { contactPhone: filters.contactPhone } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getExecutiveSummary(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.conversationAIAnalysis.findMany({
      where: { tenantId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const count = rows.length;
    const avg = (field: keyof (typeof rows)[number]) =>
      count
        ? Math.round(rows.reduce((sum, r) => sum + (Number(r[field]) || 0), 0) / count)
        : 0;
    const group = (field: keyof (typeof rows)[number]) =>
      rows.reduce(
        (acc, r) => {
          const key = String(r[field] ?? 'indefinido');
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

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

  private async analyzeMessages(tenantId: string, conversationId: number | null, messages: NormalizedMessage[]) {
    const safeMessages = messages.map((m) => ({ ...m, text: redactPII(m.text) }));

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return this.heuristicAnalysis(safeMessages);
    }

    try {
      return await this.openAiAnalysis(tenantId, conversationId, safeMessages, apiKey);
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`OpenAI indisponível. Usando análise heurística. Erro: ${err?.message ?? err}`);
      await this.logUsageFailure(tenantId, conversationId, err);
      return this.heuristicAnalysis(safeMessages);
    }
  }

  private async openAiAnalysis(
    tenantId: string,
    conversationId: number | null,
    messages: NormalizedMessage[],
    apiKey: string,
  ) {
    const model = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    const prompt = buildConversationAnalysisPrompt(messages);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Você é um analista sênior de conversão comercial imobiliária. Responda somente JSON válido.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${body}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
    if (!content) throw new Error('Resposta vazia da OpenAI.');

    const promptTokens = usage.prompt_tokens;
    const completionTokens = usage.completion_tokens;
    const { cost: estimatedCost, pricing: resolvedPricing } = await this.pricing.estimateCost(
      'openai',
      model,
      promptTokens,
      completionTokens,
    );

    let usageLogId: number | undefined;
    try {
      const created = await this.prisma.aIUsageLog.create({
        data: {
          tenantId,
          conversationId,
          operationType: 'conversation_analysis',
          modelProvider: 'openai',
          modelName: model,
          promptVersion: PROMPT_VERSION,
          promptTokens,
          completionTokens,
          estimatedCost,
          currency: resolvedPricing.currency,
          status: 'success',
        },
        select: { id: true },
      });
      usageLogId = created.id;
    } catch (err) {
      this.logger.error(`Failed to save AIUsageLog: ${(err as Error)?.message}`);
    }

    return {
      result: this.normalizeResult(JSON.parse(content)),
      modelProvider: 'openai',
      modelName: model,
      promptVersion: PROMPT_VERSION,
      usageLogId,
    };
  }

  private async logUsageFailure(tenantId: string, conversationId: number | null, error: Error) {
    const model = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    const errorCode = /HTTP (\d+)/i.exec(error?.message ?? '')?.[1] ?? 'unknown';
    await this.prisma.aIUsageLog
      .create({
        data: {
          tenantId,
          conversationId,
          operationType: 'conversation_analysis',
          modelProvider: 'openai',
          modelName: model,
          promptVersion: PROMPT_VERSION,
          promptTokens: 0,
          completionTokens: 0,
          estimatedCost: 0,
          currency: 'USD',
          status: 'failure',
          errorCode,
          errorMessage: (error?.message ?? 'unknown').slice(0, 1000),
        },
      })
      .catch((err) => this.logger.error(`Failed to save AIUsageLog failure: ${(err as Error)?.message}`));
  }

  private heuristicAnalysis(messages: NormalizedMessage[]) {
    const allText = messages.map((m) => m.text.toLowerCase()).join(' ');
    const contactMessages = messages.filter((m) => m.sender === 'contact');
    const operatorMessages = messages.filter((m) => m.sender === 'operator');
    const firstContact = contactMessages[0];
    const firstOperatorAfterContact = firstContact
      ? operatorMessages.find((m) => new Date(m.datetime).getTime() >= new Date(firstContact.datetime).getTime())
      : undefined;

    const firstResponseMinutes =
      firstContact && firstOperatorAfterContact
        ? Math.max(
            0,
            Math.round(
              (new Date(firstOperatorAfterContact.datetime).getTime() - new Date(firstContact.datetime).getTime()) / 60000,
            ),
          )
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
    const hasProposalOrSimulationAttempt = ['simulação', 'simular', 'proposta', 'condição', 'fluxo de pagamento'].some((t) =>
      allText.includes(t),
    );
    const hasQualification = ['renda', 'financiamento', 'prazo', 'região', 'dormitório', 'quartos', 'entrada'].some((t) =>
      allText.includes(t),
    );
    const hasSellerAbandonment = messages.length > 1 && messages[messages.length - 1].sender === 'contact';
    const hasLeadAbandonment = messages.length > 1 && messages[messages.length - 1].sender === 'operator';

    const intentScore =
      (allText.includes('visita') ? 25 : 0) +
      (allText.includes('proposta') || allText.includes('simulação') ? 25 : 0) +
      (allText.includes('preço') || allText.includes('valor') ? 15 : 0) +
      (hasQualification ? 20 : 0) +
      (contactMessages.length >= 3 ? 15 : 0);

    const leadIntent =
      intentScore >= 75 ? 'quente' : intentScore >= 50 ? 'qualificado' : intentScore >= 25 ? 'pesquisa' : 'indefinido';
    const sellerQualityScore = Math.min(
      100,
      35 +
        (hasQualification ? 20 : 0) +
        (hasSchedulingAttempt ? 20 : 0) +
        (hasProposalOrSimulationAttempt ? 15 : 0) +
        (firstResponseMinutes !== null && firstResponseMinutes <= 10 ? 10 : 0) -
        (hasSellerAbandonment ? 20 : 0),
    );
    const lostOpportunity = intentScore >= 50 && hasSellerAbandonment;

    const finalResult = this.normalizeResult({
      summary: `Conversa analisada automaticamente com ${messages.length} mensagens. Intenção estimada: ${leadIntent}.`,
      leadIntent,
      opportunityStatus: lostOpportunity ? 'pronta_para_retomada' : hasSellerAbandonment ? 'em_risco' : 'ativa',
      risk: lostOpportunity ? 'alto' : hasSellerAbandonment ? 'medio' : 'baixo',
      mainObjection: objections[0] ?? null,
      objections,
      sellerQualityScore,
      responseQualityScore:
        firstResponseMinutes === null ? 40 : firstResponseMinutes <= 10 ? 90 : firstResponseMinutes <= 60 ? 70 : 45,
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
        hasQualification
          ? 'Foram encontrados sinais de qualificação na conversa.'
          : 'Não foram encontrados sinais suficientes de qualificação.',
        hasSchedulingAttempt ? 'Há tentativa ou menção de agendamento/visita.' : 'Não há tentativa clara de agendamento.',
        objections.length ? `Objeções detectadas: ${objections.join(', ')}.` : 'Nenhuma objeção dominante detectada.',
      ],
      metrics: {
        heuristic: true,
        contactMessages: contactMessages.length,
        operatorMessages: operatorMessages.length,
        intentScore,
      },
    });

    return {
      result: finalResult,
      modelProvider: 'heuristic',
      modelName: 'regex-engine-v1',
      promptVersion: 'none',
      usageLogId: undefined as number | undefined,
    };
  }

  private normalizeResult(input: any): ConversationAIResult {
    const clamp = (n: any) =>
      Math.max(0, Math.min(100, Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0));
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
      firstResponseMinutes:
        input.firstResponseMinutes === null || input.firstResponseMinutes === undefined
          ? null
          : Number(input.firstResponseMinutes),
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

  private async persistAnalysis(
    tenantId: string,
    payload: {
      contactPhone: string;
      contactName?: string | null;
      segment?: number | null;
      userId?: number | null;
      userName?: string | null;
      conversationStart: Date;
      conversationEnd: Date;
      messageCount: number;
      result: ConversationAIResult;
      modelProvider: string;
      modelName: string;
      promptVersion: string;
    },
  ) {
    const r = payload.result;
    return this.prisma.conversationAIAnalysis.create({
      data: {
        tenantId,
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
        modelProvider: payload.modelProvider,
        modelName: payload.modelName,
        promptVersion: payload.promptVersion,
      },
      select: { id: true },
    });
  }

  private topObjections(rows: { objections: string | null }[]) {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      try {
        const items = JSON.parse(row.objections || '[]') as unknown;
        if (Array.isArray(items)) {
          for (const item of items) counts[String(item)] = (counts[String(item)] ?? 0) + 1;
        }
      } catch {
        // ignore malformed payloads
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([objection, count]) => ({ objection, count }));
  }
}
