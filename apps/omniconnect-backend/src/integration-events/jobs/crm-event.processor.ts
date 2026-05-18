import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IntegrationEventsService } from '../integration-events.service';

interface CrmEventJobData {
  eventId: string;
  tenantId: string;
}

/**
 * CRM event processor (stub).
 *
 * Bloco 2 only persists and acks the event. Domain handlers (lead/contact
 * sync, deal-stage updates, etc.) come in a follow-up sprint.
 */
@Processor('crm-events')
export class CrmEventProcessor {
  private readonly logger = new Logger(CrmEventProcessor.name);

  constructor(private readonly events: IntegrationEventsService) {}

  @Process('process-event')
  async handle(job: Job<CrmEventJobData>) {
    const { eventId, tenantId } = job.data;
    try {
      this.logger.log(`Processing CRM event ${eventId} (tenant=${tenantId})`);
      await this.events.markProcessed(eventId);
    } catch (error) {
      this.logger.error(`Failed CRM event ${eventId}: ${(error as Error).message}`);
      await this.events.markFailed(eventId, error);
      throw error;
    }
  }
}
