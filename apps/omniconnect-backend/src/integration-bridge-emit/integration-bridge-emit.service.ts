import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { IntegrationEventsService } from '../integration-events/integration-events.service';
import { parseBridgeEventPayload } from '../integration-events/bridge-event-contract';
import type { IntegrationProvider } from '../integration-events/integration-events.service';
import { PrismaService } from '../prisma.service';
import { EmitBridgeEventDto } from './dto/emit-bridge-event.dto';

export interface EmitBridgeEventResult {
  eventId: string;
  alreadyProcessed: boolean;
  tenantId: string;
}

@Injectable()
export class IntegrationBridgeEmitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: IntegrationEventsService,
  ) {}

  async emitForTenant(
    tenantId: string,
    dto: EmitBridgeEventDto,
  ): Promise<EmitBridgeEventResult> {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        id: dto.connectionId,
        tenantId,
        provider: dto.provider,
        status: 'active',
      },
      include: { tenant: true },
    });

    if (!connection || !connection.tenant?.isActive) {
      throw new NotFoundException(
        'Integration connection not found for this tenant or inactive',
      );
    }

    const occurredAt =
      dto.occurredAt?.trim() && !Number.isNaN(Date.parse(dto.occurredAt))
        ? new Date(dto.occurredAt).toISOString()
        : new Date().toISOString();

    const payload: Record<string, unknown> = {
      eventType: dto.eventType,
      externalId: dto.externalId,
      occurredAt,
    };
    if (dto.source !== undefined) payload.source = dto.source;
    payload.data = dto.data;

    parseBridgeEventPayload(dto.provider, payload);

    const idempotencyKey =
      dto.idempotencyKey?.trim() ||
      this.defaultIdempotencyKey(tenantId, dto.provider, dto);

    const recorded = await this.events.recordEvent({
      tenantId,
      connectionId: connection.id,
      provider: dto.provider,
      idempotencyKey,
      signature: null,
      payload: payload as Prisma.InputJsonValue,
    });

    return { ...recorded, tenantId };
  }

  /**
   * Stable fallback when the client does not send an explicit key:
   * same logical event retries dedupe; distinct payloads get distinct keys.
   */
  private defaultIdempotencyKey(
    tenantId: string,
    provider: IntegrationProvider,
    dto: EmitBridgeEventDto,
  ): string {
    const h = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          tenantId,
          connectionId: dto.connectionId,
          provider,
          externalId: dto.externalId,
          eventType: dto.eventType,
          data: dto.data,
        }),
      )
      .digest('hex')
      .slice(0, 48);
    return `emit:${provider}:${dto.externalId}:${dto.eventType}:${h}`;
  }
}
