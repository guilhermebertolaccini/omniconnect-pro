import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MessageBroker,
  MessageBrokerChannel,
  MessageBrokerStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';
import { CreateMessageBrokerDto } from './dto/create-message-broker.dto';
import { UpdateMessageBrokerDto } from './dto/update-message-broker.dto';
import { ListMessageBrokersQueryDto } from './dto/list-message-brokers-query.dto';

/**
 * Public-safe representation of MessageBroker. Credenciais cifradas nunca
 * saem; expomos apenas flags `hasApiKey`/`hasApiSecret`/`hasWebhookSecret`
 * + hint (últimos 4 chars do plaintext, **apenas** quando acabou de chegar
 * no create/update — listagens nunca incluem hint).
 */
export interface MaskedMessageBroker {
  id: string;
  tenantId: string;
  channel: MessageBrokerChannel;
  vendor: string;
  label: string;
  status: MessageBrokerStatus;
  autoDisableOnBounce: boolean;
  monthlyCostCents: number;
  fallbackBrokerId: string | null;
  statusMap: Prisma.JsonValue;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasWebhookSecret: boolean;
  apiKeyHint: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: number | null;
}

interface BrokerRecord {
  id: string;
  tenantId: string;
  channel: MessageBrokerChannel;
  vendor: string;
  label: string;
  status: MessageBrokerStatus;
  autoDisableOnBounce: boolean;
  monthlyCostCents: number;
  fallbackBrokerId: string | null;
  statusMap: Prisma.JsonValue;
  apiKeyEncrypted: string | null;
  apiSecretEncrypted: string | null;
  webhookSecretEncrypted: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: number | null;
}

@Injectable()
export class MessageBrokersService {
  private readonly logger = new Logger(MessageBrokersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: BridgeSecretCipher,
    private readonly systemEvents: SystemEventsService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateMessageBrokerDto,
    actorId?: number,
  ): Promise<MaskedMessageBroker> {
    if (dto.fallbackBrokerId) {
      await this.assertFallbackOwnership(tenantId, dto.fallbackBrokerId);
    }

    const record = await this.prisma.messageBroker.create({
      data: {
        tenantId,
        channel: dto.channel,
        vendor: dto.vendor,
        label: dto.label,
        status: dto.status ?? MessageBrokerStatus.connected,
        autoDisableOnBounce: dto.autoDisableOnBounce ?? true,
        monthlyCostCents: dto.monthlyCostCents ?? 0,
        fallbackBrokerId: dto.fallbackBrokerId ?? null,
        statusMap: dto.statusMap as Prisma.InputJsonValue,
        apiKeyEncrypted: dto.apiKey ? this.cipher.encrypt(dto.apiKey) : null,
        apiSecretEncrypted: dto.apiSecret ? this.cipher.encrypt(dto.apiSecret) : null,
        webhookSecretEncrypted: dto.webhookSecret ? this.cipher.encrypt(dto.webhookSecret) : null,
        createdById: actorId ?? null,
      },
    });

    void this.systemEvents.logEvent(
      EventType.MESSAGE_BROKER_CREATED,
      EventModule.MESSAGE_BROKERS,
      { brokerId: record.id, channel: record.channel, vendor: record.vendor },
      actorId ?? null,
      EventSeverity.SUCCESS,
      tenantId,
    );

    return this.mask(record, dto.apiKey);
  }

  async findAll(
    tenantId: string,
    filters: ListMessageBrokersQueryDto = {},
  ): Promise<MaskedMessageBroker[]> {
    const records = await this.prisma.messageBroker.findMany({
      where: {
        tenantId,
        ...(filters.channel ? { channel: filters.channel } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: [{ channel: 'asc' }, { label: 'asc' }],
    });
    return records.map((r) => this.mask(r));
  }

  async findOne(tenantId: string, id: string): Promise<MaskedMessageBroker> {
    const record = await this.prisma.messageBroker.findFirst({
      where: { id, tenantId },
    });
    if (!record) {
      throw new NotFoundException('MessageBroker not found for this tenant');
    }
    return this.mask(record);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateMessageBrokerDto,
    actorId?: number,
  ): Promise<MaskedMessageBroker> {
    const existing = await this.prisma.messageBroker.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('MessageBroker not found for this tenant');
    }

    if (dto.fallbackBrokerId !== undefined && dto.fallbackBrokerId !== null) {
      if (dto.fallbackBrokerId === id) {
        throw new BadRequestException('A broker cannot be its own fallback');
      }
      await this.assertFallbackOwnership(tenantId, dto.fallbackBrokerId);
    }

    const data: Prisma.MessageBrokerUpdateInput = {};
    if (dto.vendor !== undefined) data.vendor = dto.vendor;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.autoDisableOnBounce !== undefined) data.autoDisableOnBounce = dto.autoDisableOnBounce;
    if (dto.monthlyCostCents !== undefined) data.monthlyCostCents = dto.monthlyCostCents;
    if (dto.fallbackBrokerId !== undefined) {
      data.fallbackBroker =
        dto.fallbackBrokerId === null
          ? { disconnect: true }
          : { connect: { id: dto.fallbackBrokerId } };
    }
    if (dto.statusMap !== undefined) data.statusMap = dto.statusMap as Prisma.InputJsonValue;
    if (dto.apiKey !== undefined) {
      data.apiKeyEncrypted = dto.apiKey ? this.cipher.encrypt(dto.apiKey) : null;
    }
    if (dto.apiSecret !== undefined) {
      data.apiSecretEncrypted = dto.apiSecret ? this.cipher.encrypt(dto.apiSecret) : null;
    }
    if (dto.webhookSecret !== undefined) {
      data.webhookSecretEncrypted = dto.webhookSecret
        ? this.cipher.encrypt(dto.webhookSecret)
        : null;
    }

    const updated = await this.prisma.messageBroker.update({
      where: { id },
      data,
    });

    void this.systemEvents.logEvent(
      EventType.MESSAGE_BROKER_UPDATED,
      EventModule.MESSAGE_BROKERS,
      {
        brokerId: id,
        statusChanged: dto.status !== undefined && dto.status !== existing.status,
        prevStatus: existing.status,
        nextStatus: dto.status,
      },
      actorId ?? null,
      EventSeverity.INFO,
      tenantId,
    );

    if (dto.status !== undefined && dto.status !== existing.status) {
      void this.systemEvents.logEvent(
        EventType.MESSAGE_BROKER_STATUS_CHANGED,
        EventModule.MESSAGE_BROKERS,
        { brokerId: id, from: existing.status, to: dto.status },
        actorId ?? null,
        dto.status === MessageBrokerStatus.disconnected
          ? EventSeverity.WARNING
          : EventSeverity.INFO,
        tenantId,
      );
    }

    return this.mask(updated, dto.apiKey ?? undefined);
  }

  async remove(
    tenantId: string,
    id: string,
    actorId?: number,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.messageBroker.findFirst({
      where: { id, tenantId },
      select: { id: true, channel: true, vendor: true },
    });
    if (!existing) {
      throw new NotFoundException('MessageBroker not found for this tenant');
    }
    await this.prisma.messageBroker.delete({ where: { id } });

    void this.systemEvents.logEvent(
      EventType.MESSAGE_BROKER_DELETED,
      EventModule.MESSAGE_BROKERS,
      { brokerId: id, channel: existing.channel, vendor: existing.vendor },
      actorId ?? null,
      EventSeverity.INFO,
      tenantId,
    );

    return { id };
  }

  /**
   * Smoke test: confirma que `apiKeyEncrypted` decifra. Não chama o vendor
   * real (Sprint Foundation não inclui sinks). Quando os sinks existirem,
   * cada um deve estender este método com seu próprio ping específico.
   */
  async testBroker(
    tenantId: string,
    id: string,
    actorId?: number,
  ): Promise<{ id: string; canDecrypt: boolean; status: MessageBrokerStatus }> {
    const record = await this.prisma.messageBroker.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, apiKeyEncrypted: true },
    });
    if (!record) {
      throw new NotFoundException('MessageBroker not found for this tenant');
    }
    let canDecrypt = false;
    if (record.apiKeyEncrypted) {
      try {
        const plain = this.cipher.decryptWithLegacyFallback(record.apiKeyEncrypted);
        canDecrypt = typeof plain === 'string' && plain.length > 0;
      } catch (err) {
        this.logger.warn(
          `MessageBroker ${id} (tenant ${tenantId}): falha ao decifrar apiKey`,
        );
        canDecrypt = false;
      }
    }
    void this.systemEvents.logEvent(
      EventType.MESSAGE_BROKER_TESTED,
      EventModule.MESSAGE_BROKERS,
      { brokerId: id, canDecrypt },
      actorId ?? null,
      canDecrypt ? EventSeverity.SUCCESS : EventSeverity.WARNING,
      tenantId,
    );
    return { id: record.id, canDecrypt, status: record.status };
  }

  /**
   * Server-side only — usado pelos sinks da Régua quando precisarem mandar.
   * Nunca exponha o retorno em REST endpoint.
   */
  async getDecryptedApiKey(tenantId: string, id: string): Promise<{
    apiKey: string;
    vendor: string;
    channel: MessageBrokerChannel;
  }> {
    const record = await this.prisma.messageBroker.findFirst({
      where: { id, tenantId },
      select: { apiKeyEncrypted: true, vendor: true, channel: true },
    });
    if (!record) {
      throw new NotFoundException('MessageBroker not found for this tenant');
    }
    if (!record.apiKeyEncrypted) {
      throw new BadRequestException('MessageBroker has no apiKey configured');
    }
    return {
      apiKey: this.cipher.decryptWithLegacyFallback(record.apiKeyEncrypted),
      vendor: record.vendor,
      channel: record.channel,
    };
  }

  private async assertFallbackOwnership(tenantId: string, fallbackId: string): Promise<void> {
    const found = await this.prisma.messageBroker.findFirst({
      where: { id: fallbackId, tenantId },
      select: { id: true },
    });
    if (!found) {
      throw new BadRequestException('fallbackBrokerId não pertence ao tenant');
    }
  }

  private mask(record: MessageBroker | BrokerRecord, recentApiKey?: string): MaskedMessageBroker {
    const hint =
      recentApiKey && recentApiKey.length >= 4 ? recentApiKey.slice(-4) : null;
    return {
      id: record.id,
      tenantId: record.tenantId,
      channel: record.channel,
      vendor: record.vendor,
      label: record.label,
      status: record.status,
      autoDisableOnBounce: record.autoDisableOnBounce,
      monthlyCostCents: record.monthlyCostCents,
      fallbackBrokerId: record.fallbackBrokerId,
      statusMap: record.statusMap,
      hasApiKey: !!record.apiKeyEncrypted,
      hasApiSecret: !!record.apiSecretEncrypted,
      hasWebhookSecret: !!record.webhookSecretEncrypted,
      apiKeyHint: hint,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdById: record.createdById,
    };
  }
}
