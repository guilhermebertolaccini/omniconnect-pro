import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IntegrationEventsService } from '../integration-events.service';
import { BridgeEventDispatcherService } from '../bridge-event-dispatcher.service';

interface AdsEventJobData {
  eventId: string;
  tenantId: string;
}

/**
 * Ads event processor. Bloco 2 validates and dispatches a typed bridge
 * envelope; domain handlers (lead-form ingestion, campaign cost sync, etc.)
 * are wired in later blocks.
 */
@Processor('ads-events')
export class AdsEventProcessor {
  private readonly logger = new Logger(AdsEventProcessor.name);

  constructor(
    private readonly events: IntegrationEventsService,
    private readonly dispatcher: BridgeEventDispatcherService,
  ) {}

  @Process('process-event')
  async handle(job: Job<AdsEventJobData>) {
    const { eventId, tenantId } = job.data;
    try {
      this.logger.log(`Processing Ads event ${eventId} (tenant=${tenantId})`);
      const event = await this.events.getEventForProcessing(eventId, tenantId, 'ads');
      await this.dispatcher.dispatch(event, 'ads');
      await this.events.markProcessed(eventId, tenantId);
    } catch (error) {
      this.logger.error(`Failed Ads event ${eventId}: ${(error as Error).message}`);
      await this.events.markFailed(eventId, tenantId, error);
      throw error;
    }
  }
}
