import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AntiFatigueAppliesTo,
  AntiFatigueDedupeLog,
  AntiFatigueRule,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';
import { UpsertAntiFatigueRuleDto } from './dto/upsert-rule.dto';
import { ListDedupeLogQueryDto } from './dto/list-dedupe-log-query.dto';

export type CheckBeforeSendResult =
  | { allowed: true }
  | { allowed: false; reason: 'disabled' | 'window' | 'off_hours' };

export interface CheckBeforeSendOptions {
  /** Quando true e a regra permite, bypassa janela (não bypassa horário). */
  urgent?: boolean;
}

@Injectable()
export class AntiFatigueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemEvents: SystemEventsService,
  ) {}

  /**
   * Idempotente. Carrega a regra do tenant; cria com defaults se ausente.
   */
  async ensureRule(tenantId: string, actorId?: number | null): Promise<AntiFatigueRule> {
    const existing = await this.prisma.antiFatigueRule.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    const created = await this.prisma.antiFatigueRule.create({
      data: { tenantId },
    });
    void this.systemEvents.logEvent(
      EventType.ANTIFATIGUE_RULE_UPDATED,
      EventModule.ANTI_FATIGUE,
      { ruleId: created.id, created: true },
      actorId ?? null,
      EventSeverity.INFO,
      tenantId,
    );
    return created;
  }

  async getMyRule(tenantId: string, actorId?: number | null): Promise<AntiFatigueRule> {
    return this.ensureRule(tenantId, actorId);
  }

  async upsertMyRule(
    tenantId: string,
    dto: UpsertAntiFatigueRuleDto,
    actorId?: number | null,
  ): Promise<AntiFatigueRule> {
    // Validação cruzada: ambos os horários devem vir juntos.
    const hasStart = dto.businessHoursStart != null;
    const hasEnd = dto.businessHoursEnd != null;
    if (hasStart !== hasEnd) {
      throw new BadRequestException(
        'businessHoursStart e businessHoursEnd devem vir juntos (ou ambos null)',
      );
    }

    const rule = await this.ensureRule(tenantId, actorId);

    const data: Prisma.AntiFatigueRuleUpdateInput = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.windowHours !== undefined) data.windowHours = dto.windowHours;
    if (dto.appliesTo !== undefined) data.appliesTo = dto.appliesTo;
    if (dto.allowBypassForUrgent !== undefined)
      data.allowBypassForUrgent = dto.allowBypassForUrgent;
    if (dto.businessHoursStart !== undefined)
      data.businessHoursStart = dto.businessHoursStart ?? null;
    if (dto.businessHoursEnd !== undefined)
      data.businessHoursEnd = dto.businessHoursEnd ?? null;

    const updated = await this.prisma.antiFatigueRule.update({
      where: { id: rule.id },
      data,
    });

    void this.systemEvents.logEvent(
      EventType.ANTIFATIGUE_RULE_UPDATED,
      EventModule.ANTI_FATIGUE,
      { ruleId: rule.id, changes: Object.keys(data) },
      actorId ?? null,
      EventSeverity.INFO,
      tenantId,
    );

    return updated;
  }

  async listDedupeLog(
    tenantId: string,
    query: ListDedupeLogQueryDto,
  ): Promise<{
    items: AntiFatigueDedupeLog[];
    meta: { total: number; limit: number; offset: number };
  }> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    if ((query.from && !query.to) || (query.to && !query.from)) {
      throw new BadRequestException('from e to devem vir juntos');
    }

    const where: Prisma.AntiFatigueDedupeLogWhereInput = {
      tenantId,
      ...(query.contactKey ? { contactKey: this.normalizeKey(query.contactKey) } : {}),
      ...(query.channel ? { channel: query.channel.toLowerCase() } : {}),
      ...(query.from && query.to
        ? { blockedAt: { gte: new Date(query.from), lte: new Date(query.to) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.antiFatigueDedupeLog.findMany({
        where,
        orderBy: { blockedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.antiFatigueDedupeLog.count({ where }),
    ]);

    return { items, meta: { total, limit, offset } };
  }

  /**
   * Helper interno para a Régua chamar antes de cada send.
   * - Se regra `enabled=false` → permite sempre.
   * - Se fora de `businessHours` → bloqueia com `off_hours` (sem registrar
   *   no log; off-hours não é spam, é só "voltar mais tarde").
   * - Se houver send dentro de `windowHours` para o mesmo
   *   `(tenantId, contactKey, channel)` → bloqueia com `window` e
   *   grava `AntiFatigueDedupeLog` para auditoria.
   * - Quando bloqueia, emite `ANTIFATIGUE_BLOCKED`.
   *
   * `contactKey` é normalizado (lowercase + remove non-alphanumeric).
   * A Régua deve passar phone E.164 ou documento (CPF/CNPJ) dependendo
   * do `appliesTo` configurado.
   */
  async checkBeforeSend(
    tenantId: string,
    contactKey: string,
    channel: string,
    refType: string,
    refId: string,
    options: CheckBeforeSendOptions = {},
  ): Promise<CheckBeforeSendResult> {
    const rule = await this.prisma.antiFatigueRule.findUnique({
      where: { tenantId },
    });
    if (!rule || !rule.enabled) {
      return { allowed: true };
    }

    if (this.isOffHours(rule)) {
      void this.systemEvents.logEvent(
        EventType.ANTIFATIGUE_BLOCKED,
        EventModule.ANTI_FATIGUE,
        { ruleId: rule.id, reason: 'off_hours', channel, refType, refId },
        null,
        EventSeverity.WARNING,
        tenantId,
      );
      return { allowed: false, reason: 'off_hours' };
    }

    if (options.urgent && rule.allowBypassForUrgent) {
      return { allowed: true };
    }

    const key = this.normalizeKey(contactKey);
    const channelLower = channel.toLowerCase();
    const cutoff = new Date(Date.now() - rule.windowHours * 60 * 60 * 1000);

    // Busca QUALQUER dedupe-log ou send recente no canal — Foundation
    // mantém o log centralizado nesta tabela (no schema da Régua, runs
    // podem alimentar isso direto).
    const recent = await this.prisma.antiFatigueDedupeLog.findFirst({
      where: {
        tenantId,
        contactKey: key,
        channel: channelLower,
        blockedAt: { gte: cutoff },
      },
      select: { id: true, blockedAt: true },
      orderBy: { blockedAt: 'desc' },
    });

    if (recent) {
      // Já bloqueado dentro da janela; grava nova linha pra auditoria do
      // bloqueio + emite evento. NÃO grava se a Régua quiser registrar
      // sucessos também — isso é responsabilidade dela.
      await this.prisma.antiFatigueDedupeLog.create({
        data: {
          tenantId,
          contactKey: key,
          channel: channelLower,
          refType,
          refId,
        },
      });
      void this.systemEvents.logEvent(
        EventType.ANTIFATIGUE_BLOCKED,
        EventModule.ANTI_FATIGUE,
        {
          ruleId: rule.id,
          reason: 'window',
          contactKey: key,
          channel: channelLower,
          refType,
          refId,
          previousBlockAt: recent.blockedAt.toISOString(),
        },
        null,
        EventSeverity.WARNING,
        tenantId,
      );
      return { allowed: false, reason: 'window' };
    }

    // Permite. NÃO grava no log automaticamente — quem grava o send real
    // é o caller (Régua sink). Mantém este método read-mostly + register
    // só dos bloqueios.
    return { allowed: true };
  }

  /**
   * Registro explícito (a Régua chama logo após mandar com sucesso para
   * que a próxima tentativa entre na janela). Idempotência é problema
   * do caller (usar `(refType, refId)` único determinístico).
   */
  async recordSend(
    tenantId: string,
    contactKey: string,
    channel: string,
    refType: string,
    refId: string,
  ): Promise<void> {
    await this.prisma.antiFatigueDedupeLog.create({
      data: {
        tenantId,
        contactKey: this.normalizeKey(contactKey),
        channel: channel.toLowerCase(),
        refType,
        refId,
      },
    });
  }

  /** Normaliza phone E.164 ou documento (remove tudo que não é alfanumérico, lowercase). */
  private normalizeKey(raw: string): string {
    return raw.toLowerCase().replace(/[^a-z0-9+]/g, '');
  }

  /**
   * Checa se está fora do horário comercial. UTC. Se `start`/`end`
   * não estiverem setados, sempre dentro. `start > end` indica janela
   * cruzando meia-noite (ex.: 22:00 → 06:00).
   */
  private isOffHours(rule: AntiFatigueRule): boolean {
    if (!rule.businessHoursStart || !rule.businessHoursEnd) return false;
    const now = new Date();
    const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
    const start = rule.businessHoursStart;
    const end = rule.businessHoursEnd;
    if (start <= end) {
      return !(hhmm >= start && hhmm < end);
    }
    // Janela cruzando meia-noite
    return !(hhmm >= start || hhmm < end);
  }
}

// Re-export para legibilidade nos consumers
export type { AntiFatigueAppliesTo };
