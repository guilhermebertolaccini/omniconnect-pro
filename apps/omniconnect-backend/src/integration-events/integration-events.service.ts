import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type IntegrationProvider = 'crm' | 'ads' | 'bot';

export interface RecordEventInput {
  tenantId: string;
  connectionId: string;
  provider: IntegrationProvider;
  idempotencyKey: string;
  signature?: string | null;
  payload: Prisma.InputJsonValue;
}

export interface RecordedEvent {
  eventId: string;
  alreadyProcessed: boolean;
}

const QUEUE_BY_PROVIDER: Record<IntegrationProvider, string> = {
  crm: 'crm-events',
  ads: 'ads-events',
  bot: 'bot-events',
};

@Injectable()
export class IntegrationEventsService {
  private readonly logger = new Logger(IntegrationEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('crm-events') private readonly crmQueue: Queue,
    @InjectQueue('ads-events') private readonly adsQueue: Queue,
    @InjectQueue('bot-events') private readonly botQueue: Queue,
  ) {}

  async recordEvent(input: RecordEventInput): Promise<RecordedEvent> {
    const { tenantId, connectionId, provider, idempotencyKey, signature, payload } = input;

    const existing = await this.prisma.integrationEvent.findUnique({
      where: { idempotencyKey },
      select: { id: true, tenantId: true, status: true },
    });

    if (existing) {
      if (existing.tenantId !== tenantId) {
        this.logger.warn(
          `idempotencyKey collision across tenants. key=${idempotencyKey} expected=${tenantId} got=${existing.tenantId}`,
        );
      }
      return { eventId: existing.id, alreadyProcessed: true };
    }

    const event = await this.prisma.integrationEvent.create({
      data: {
        tenantId,
        connectionId,
        provider,
        idempotencyKey,
        signature: signature ?? null,
        payload,
      },
      select: { id: true },
    });

    await this.enqueue(provider, { eventId: event.id, tenantId });

    return { eventId: event.id, alreadyProcessed: false };
  }

  async markProcessed(eventId: string) {
    await this.prisma.integrationEvent.update({
      where: { id: eventId },
      data: { status: 'processed', processedAt: new Date(), errorMessage: null },
    });
  }

  async markFailed(eventId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.prisma.integrationEvent
      .update({
        where: { id: eventId },
        data: { status: 'failed', processedAt: new Date(), errorMessage: message.slice(0, 1000) },
      })
      .catch((err) => this.logger.error(`Failed to mark event ${eventId} as failed: ${err?.message}`));
  }

  private async enqueue(provider: IntegrationProvider, data: { eventId: string; tenantId: string }) {
    const queue = this.queueFor(provider);
    await queue.add('process-event', data, {
      jobId: data.eventId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }

  private queueFor(provider: IntegrationProvider): Queue {
    switch (provider) {
      case 'crm':
        return this.crmQueue;
      case 'ads':
        return this.adsQueue;
      case 'bot':
        return this.botQueue;
      default: {
        const _exhaustive: never = provider;
        throw new Error(`Unknown integration provider: ${_exhaustive}`);
      }
    }
  }

  static queueNameFor(provider: IntegrationProvider): string {
    return QUEUE_BY_PROVIDER[provider];
  }
}
