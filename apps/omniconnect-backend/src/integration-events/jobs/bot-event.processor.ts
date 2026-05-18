import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IntegrationEventsService } from '../integration-events.service';
import { BridgeEventDispatcherService } from '../bridge-event-dispatcher.service';

interface BotEventJobData {
  eventId: string;
  tenantId: string;
}

/**
 * Bot (Botify) event processor. Bloco 2 validates and dispatches a typed
 * bridge envelope; domain handlers (flow state sync, handoff requests,
 * AI-handoff escalations, etc.) are wired in later blocks.
 */
@Processor('bot-events')
export class BotEventProcessor {
  private readonly logger = new Logger(BotEventProcessor.name);

  constructor(
    private readonly events: IntegrationEventsService,
    private readonly dispatcher: BridgeEventDispatcherService,
  ) {}

  @Process('process-event')
  async handle(job: Job<BotEventJobData>) {
    const { eventId, tenantId } = job.data;
    try {
      this.logger.log(`Processing Bot event ${eventId} (tenant=${tenantId})`);
      const event = await this.events.getEventForProcessing(eventId, tenantId, 'bot');
      await this.dispatcher.dispatch(event, 'bot');
      await this.events.markProcessed(eventId, tenantId);
    } catch (error) {
      this.logger.error(`Failed Bot event ${eventId}: ${(error as Error).message}`);
      await this.events.markFailed(eventId, tenantId, error);
      throw error;
    }
  }
}
