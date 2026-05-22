import { Injectable } from '@nestjs/common';
import {
  LineHealthAction,
  LineHealthPolicy,
  LineStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { LineReputationService } from '../line-reputation/line-reputation.service';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';
import { UpsertLineHealthPolicyDto } from './dto/upsert-line-health-policy.dto';

export interface LineHealthEntry {
  lineId: number;
  phone: string;
  status: LineStatus;
  numberId: string;
  appId: number;
  healthScore: number;
  blockRate: number;
  responseRate: number;
  messagesPerDay: number;
  lastCalculated: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class LineHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineReputation: LineReputationService,
    private readonly systemEvents: SystemEventsService,
  ) {}

  async ensurePolicy(
    tenantId: string,
    actorId?: number | null,
  ): Promise<LineHealthPolicy> {
    const existing = await this.prisma.lineHealthPolicy.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;
    const created = await this.prisma.lineHealthPolicy.create({
      data: { tenantId },
    });
    void this.systemEvents.logEvent(
      EventType.LINE_BANNED, // sem evento dedicado pra policy ainda; reaproveita módulo
      EventModule.LINES,
      { policyId: created.id, action: 'created_with_defaults' },
      actorId ?? null,
      EventSeverity.INFO,
      tenantId,
    );
    return created;
  }

  async getPolicy(tenantId: string, actorId?: number | null): Promise<LineHealthPolicy> {
    return this.ensurePolicy(tenantId, actorId);
  }

  async upsertPolicy(
    tenantId: string,
    dto: UpsertLineHealthPolicyDto,
    actorId?: number | null,
  ): Promise<LineHealthPolicy> {
    const policy = await this.ensurePolicy(tenantId, actorId);
    const data: Prisma.LineHealthPolicyUpdateInput = {};
    if (dto.alertHoursMedium !== undefined) data.alertHoursMedium = dto.alertHoursMedium;
    if (dto.alertHoursLow !== undefined) data.alertHoursLow = dto.alertHoursLow;
    if (dto.autoActionOnCritical !== undefined)
      data.autoActionOnCritical = dto.autoActionOnCritical;
    if (dto.autoActionOnHigh !== undefined)
      data.autoActionOnHigh = dto.autoActionOnHigh;
    if (dto.suggestRotation !== undefined) data.suggestRotation = dto.suggestRotation;

    const updated = await this.prisma.lineHealthPolicy.update({
      where: { id: policy.id },
      data,
    });

    void this.systemEvents.logEvent(
      EventType.LINE_BANNED, // alinhar futuramente; reuse o módulo LINES
      EventModule.LINES,
      { policyId: policy.id, changes: Object.keys(data), action: 'policy_updated' },
      actorId ?? null,
      EventSeverity.INFO,
      tenantId,
    );

    return updated;
  }

  async listLines(tenantId: string): Promise<LineHealthEntry[]> {
    const lines = await this.prisma.linesStock.findMany({
      where: { tenantId },
      orderBy: [{ lineStatus: 'asc' }, { id: 'asc' }],
    });
    if (lines.length === 0) return [];

    const reputations = await Promise.all(
      lines.map((l) =>
        this.lineReputation.calculateReputation(l.id).catch(() => null),
      ),
    );

    return lines.map((line, idx) => {
      const rep = reputations[idx];
      return {
        lineId: line.id,
        phone: line.phone,
        status: line.lineStatus,
        numberId: line.numberId,
        appId: line.appId,
        healthScore: rep?.healthScore ?? 0,
        blockRate: rep?.blockRate ?? 0,
        responseRate: rep?.responseRate ?? 0,
        messagesPerDay: rep?.messagesPerDay ?? 0,
        lastCalculated: rep
          ? rep.lastCalculated.toISOString()
          : new Date(0).toISOString(),
        createdAt: line.createdAt.toISOString(),
        updatedAt: line.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Helper para Régua: ler a ação configurada por nível de saúde.
   *
   * O enum `LineStatus` hoje tem só `active` / `ban` — a noção de "high"
   * vs "critical" é derivada do healthScore + tempo no status pelo
   * service. Por ora, `ban` mapeia para `autoActionOnCritical`; `active`
   * com healthScore baixo ainda é `none` (alerta apenas).
   */
  resolveActionForStatus(
    policy: LineHealthPolicy,
    status: LineStatus,
  ): LineHealthAction {
    if (status === LineStatus.ban) return policy.autoActionOnCritical;
    return LineHealthAction.none;
  }
}
