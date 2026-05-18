import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IntegrationEventsService } from '../integration-events.service';

interface AdsEventJobData {
  eventId: string;
  tenantId: string;
}

/**
 * Ads event processor (stub).
 *
 * Bloco 2 only persists and acks the event. Domain handlers (lead-form
 * ingestion, campaign cost sync, etc.) come in a follow-up sprint.
 */
@Processor('ads-events')
export class AdsEventProcessor {
  private readonly logger = new Logger(AdsEventProcessor.name);

  constructor(private readonly events: IntegrationEventsService) {}

  @Process('process-event')
  async handle(job: Job<AdsEventJobData>) {
    const { eventId, tenantId } = job.data;
    try {
      this.logger.log(`Processing Ads event ${eventId} (tenant=${tenantId})`);
      await this.events.markProcessed(eventId);
    } catch (error) {
      this.logger.error(`Failed Ads event ${eventId}: ${(error as Error).message}`);
      await this.events.markFailed(eventId, error);
      throw error;
    }
  }
}
