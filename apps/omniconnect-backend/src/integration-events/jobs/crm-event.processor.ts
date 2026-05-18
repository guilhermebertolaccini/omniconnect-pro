import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IntegrationEventsService } from '../integration-events.service';
import { BridgeEventDispatcherService } from '../bridge-event-dispatcher.service';

interface CrmEventJobData {
  eventId: string;
  tenantId: string;
}

/**
 * CRM event processor. Bloco 2 validates and dispatches a typed bridge
 * envelope; domain handlers (lead/contact sync, deal-stage updates, etc.)
 * are wired in later blocks.
 */
@Processor('crm-events')
export class CrmEventProcessor {
  private readonly logger = new Logger(CrmEventProcessor.name);

  constructor(
    private readonly events: IntegrationEventsService,
    private readonly dispatcher: BridgeEventDispatcherService,
  ) {}

  @Process('process-event')
  async handle(job: Job<CrmEventJobData>) {
    const { eventId, tenantId } = job.data;
    try {
      this.logger.log(`Processing CRM event ${eventId} (tenant=${tenantId})`);
      const event = await this.events.getEventForProcessing(eventId, tenantId, 'crm');
      await this.dispatcher.dispatch(event, 'crm');
      await this.events.markProcessed(eventId, tenantId);
    } catch (error) {
      this.logger.error(`Failed CRM event ${eventId}: ${(error as Error).message}`);
      await this.events.markFailed(eventId, tenantId, error);
      throw error;
    }
  }
}
