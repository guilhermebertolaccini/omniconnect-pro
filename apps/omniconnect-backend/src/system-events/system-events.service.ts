import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export enum EventType {
  // Operador
  OPERATOR_CONNECTED = 'operator_connected',
  OPERATOR_DISCONNECTED = 'operator_disconnected',

  // Linhas
  LINE_CREATED = 'line_created',
  LINE_ASSIGNED = 'line_assigned',
  LINE_REALLOCATED = 'line_reallocated',
  LINE_BANNED = 'line_banned',
  LINE_UNASSIGNED = 'line_unassigned',

  // Mensagens
  MESSAGE_SENT = 'message_sent',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_QUEUED = 'message_queued',
  MESSAGE_PROCESSED = 'message_processed',

  // Erros
  API_ERROR = 'api_error',
  TIMEOUT_ERROR = 'timeout_error',
  HEALTH_CHECK_FAILED = 'health_check_failed',

  // Sistema
  CPC_TRIGGERED = 'cpc_triggered',
  REPESCAGEM_TRIGGERED = 'repescagem_triggered',
  BLOCK_PHRASE_TRIGGERED = 'block_phrase_triggered',
  AUTO_MESSAGE_SENT = 'auto_message_sent',

  // Smart Ad Automator (SAA)
  AD_PLATFORM_PROXY_CALL = 'ad_platform_proxy_call',
  AD_PLATFORM_TOKEN_REFRESHED = 'ad_platform_token_refreshed',
  AD_PLATFORM_TOKEN_REFRESH_FAILED = 'ad_platform_token_refresh_failed',
  AD_PLATFORM_TOKEN_EXPIRED = 'ad_platform_token_expired',

  // Tenant invitations / OAuth pickup
  TENANT_INVITATION_CREATED = 'tenant_invitation_created',
  TENANT_INVITATION_ACCEPTED = 'tenant_invitation_accepted',
  TENANT_INVITATION_REVOKED = 'tenant_invitation_revoked',
  TENANT_INVITATION_REJECTED = 'tenant_invitation_rejected',
  AD_PLATFORM_OAUTH_STARTED = 'ad_platform_oauth_started',
  AD_PLATFORM_OAUTH_COMPLETED = 'ad_platform_oauth_completed',
  AD_PLATFORM_OAUTH_FAILED = 'ad_platform_oauth_failed',
  AUTH_REFRESH_REUSE_DETECTED = 'auth_refresh_reuse_detected',

  // CRM Imobiliário (Sprint 3)
  CRM_SIGNATURE_ENVELOPE_CREATED = 'crm_signature_envelope_created',
  CRM_SIGNATURE_WEBHOOK_RECEIVED = 'crm_signature_webhook_received',
  CRM_CONTRACT_SIGNED = 'crm_contract_signed',

  // Bridge processors (Sprint 4)
  BRIDGE_EVENT_DISPATCHED = 'bridge_event_dispatched',
  BRIDGE_EVENT_FAILED = 'bridge_event_failed',

  // Sprint Foundation — F1: MessageBroker (ADR-0005 pré-requisito)
  MESSAGE_BROKER_CREATED = 'message_broker_created',
  MESSAGE_BROKER_UPDATED = 'message_broker_updated',
  MESSAGE_BROKER_DELETED = 'message_broker_deleted',
  MESSAGE_BROKER_TESTED = 'message_broker_tested',
  MESSAGE_BROKER_STATUS_CHANGED = 'message_broker_status_changed',

  // Sprint Foundation — F2: TenantWallet (ADR-0005 pré-requisito)
  WALLET_CREATED = 'wallet_created',
  WALLET_CONFIG_CHANGED = 'wallet_config_changed',
  WALLET_CHANNEL_COST_UPDATED = 'wallet_channel_cost_updated',
  WALLET_DEBITED = 'wallet_debited',
  WALLET_INSUFFICIENT = 'wallet_insufficient',
  WALLET_TOPUP = 'wallet_topup',
  WALLET_REFUND = 'wallet_refund',

  // Sprint Foundation — F3: AntiFatigue (ADR-0005 pré-requisito)
  ANTIFATIGUE_RULE_UPDATED = 'antifatigue_rule_updated',
  ANTIFATIGUE_BLOCKED = 'antifatigue_blocked',

  // Botify G6 — Importer WordPress → Omni (ADR-0002)
  BOTIFY_IMPORT_RUN = 'botify_import_run',
}

export enum EventSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
}

export enum EventModule {
  WEBSOCKET = 'websocket',
  LINES = 'lines',
  WEBHOOKS = 'webhooks',
  CONTROL_PANEL = 'control_panel',
  CONVERSATIONS = 'conversations',
  API_MESSAGES = 'api_messages',
  AUTO_MESSAGE = 'auto_message',
  AD_PLATFORM_PROXY = 'ad_platform_proxy',
  AD_PLATFORM_TOKEN_REFRESH = 'ad_platform_token_refresh',
  TENANT_INVITATIONS = 'tenant_invitations',
  AD_PLATFORM_OAUTH = 'ad_platform_oauth',
  AUTH = 'auth',
  CRM_SIGNATURES = 'crm_signatures',
  BRIDGE_PROCESSORS = 'bridge_processors',
  MESSAGE_BROKERS = 'message_brokers',
  TENANT_WALLETS = 'tenant_wallets',
  ANTI_FATIGUE = 'anti_fatigue',
  BOTIFY = 'botify',
}

interface EventFilters {
  type?: string;
  module?: string;
  userId?: number;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

interface MetricFilters {
  startDate?: Date;
  endDate?: Date;
  groupBy?: 'type' | 'module' | 'severity' | 'hour' | 'day';
}

@Injectable()
export class SystemEventsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Registra um evento no sistema. `tenantId` é obrigatório — callers
   * que ainda não conseguem resolver o tenant devem passar o sentinel
   * ('default-tenant') explicitamente para que seja visível em logs.
   */
  async logEvent(
    type: EventType,
    module: EventModule,
    data: any,
    userId: number | null | undefined,
    severity: EventSeverity = EventSeverity.INFO,
    tenantId: string = 'default-tenant',
  ): Promise<void> {
    try {
      await this.prisma.systemEvent.create({
        data: {
          tenantId,
          type,
          module,
          data: data ? JSON.stringify(data) : null,
          userId: userId || null,
          severity,
        },
      });
    } catch (error) {
      // Não queremos que erros no log quebrem o sistema
      console.error('❌ [SystemEvents] Erro ao registrar evento:', error);
    }
  }

  /**
   * Busca eventos com filtros, escopados por tenant.
   */
  async findEvents(tenantId: string, filters: EventFilters) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const where: any = { tenantId };

    if (filters.type) where.type = filters.type;
    if (filters.module) where.module = filters.module;
    if (filters.userId) where.userId = filters.userId;
    if (filters.severity) where.severity = filters.severity;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.systemEvent.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: filters.limit || 100,
        skip: filters.offset || 0,
      }),
      this.prisma.systemEvent.count({ where }),
    ]);

    return {
      events: events.map((event) => ({
        ...event,
        data: event.data ? JSON.parse(event.data) : null,
      })),
      total,
    };
  }

  /**
   * Sprint Quick-wins — Q2 Guards audit.
   *
   * Filtragem pré-definida sobre os módulos de guard
   * (`ANTI_FATIGUE`, `TENANT_WALLETS`, `MESSAGE_BROKERS`, `LINES`)
   * + types de bloqueio relevantes. Útil para a UI de auditoria sem
   * precisar conhecer o catálogo de `EventType`.
   */
  async findGuardsEvents(
    tenantId: string,
    filters: { startDate?: Date; endDate?: Date; limit?: number; offset?: number },
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    const guardTypes = [
      EventType.ANTIFATIGUE_BLOCKED,
      EventType.WALLET_INSUFFICIENT,
      EventType.MESSAGE_BROKER_STATUS_CHANGED,
      EventType.LINE_BANNED,
    ];

    const where: any = {
      tenantId,
      type: { in: guardTypes },
    };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.systemEvent.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 100,
        skip: filters.offset || 0,
      }),
      this.prisma.systemEvent.count({ where }),
    ]);

    return {
      events: events.map((event) => ({
        ...event,
        data: event.data ? JSON.parse(event.data) : null,
      })),
      total,
    };
  }

  /**
   * Busca métricas agregadas (escopadas por tenant).
   */
  async getMetrics(tenantId: string, filters: MetricFilters) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const where: any = { tenantId };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const events = await this.prisma.systemEvent.findMany({
      where,
      select: {
        type: true,
        module: true,
        severity: true,
        createdAt: true,
      },
    });

    const grouped: Record<string, number> = {};

    for (const event of events) {
      let key: string;
      switch (filters.groupBy) {
        case 'type':
          key = event.type;
          break;
        case 'module':
          key = event.module;
          break;
        case 'severity':
          key = event.severity;
          break;
        case 'hour':
          key = new Date(event.createdAt).toISOString().slice(0, 13) + ':00:00';
          break;
        case 'day':
          key = new Date(event.createdAt).toISOString().slice(0, 10);
          break;
        default:
          key = event.type;
      }
      grouped[key] = (grouped[key] || 0) + 1;
    }

    return grouped;
  }

  /**
   * Eventos por minuto, escopados por tenant.
   */
  async getEventsPerMinute(tenantId: string, filters: { startDate?: Date; endDate?: Date }) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const where: any = { tenantId };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const events = await this.prisma.systemEvent.findMany({
      where,
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const perMinute: Record<string, number> = {};

    for (const event of events) {
      const date = new Date(event.createdAt);
      const minute = `${date.toISOString().slice(0, 16)}:00`;
      perMinute[minute] = (perMinute[minute] || 0) + 1;
    }

    return Object.entries(perMinute)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  /**
   * Limpa eventos antigos. Tarefa global (não escopada por tenant) —
   * o retention policy é uniforme. Mantém aceitando tenantId opcional
   * para uso por tenant-admin no futuro.
   */
  async cleanOldEvents(daysToKeep: number = 30, tenantId?: string) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const where: any = { createdAt: { lt: cutoffDate } };
    if (tenantId) where.tenantId = tenantId;

    const result = await this.prisma.systemEvent.deleteMany({ where });
    return result.count;
  }
}
