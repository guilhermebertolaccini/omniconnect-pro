import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IntegrationEventsService } from '../integration-events.service';

interface BotEventJobData {
  eventId: string;
  tenantId: string;
}

/**
 * Bot (Botify) event processor (stub).
 *
 * Bloco 2 only persists and acks the event. Domain handlers (flow state
 * sync, handoff requests, AI-handoff escalations, etc.) come in a
 * follow-up sprint.
 */
@Processor('bot-events')
export class BotEventProcessor {
  private readonly logger = new Logger(BotEventProcessor.name);

  constructor(private readonly events: IntegrationEventsService) {}

  @Process('process-event')
  async handle(job: Job<BotEventJobData>) {
    const { eventId, tenantId } = job.data;
    try {
      this.logger.log(`Processing Bot event ${eventId} (tenant=${tenantId})`);
      await this.events.markProcessed(eventId);
    } catch (error) {
      this.logger.error(`Failed Bot event ${eventId}: ${(error as Error).message}`);
      await this.events.markFailed(eventId, error);
      throw error;
    }
  }
}
