import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CrmBridgeService } from './crm-bridge.service';
import { RateLimitingService } from '../rate-limiting/rate-limiting.service';

const BRIDGE_WEBHOOK_RATE_LIMIT = { maxRequests: 120, windowMs: 60_000 };

@Controller('webhooks/crm')
export class CrmBridgeController {
  constructor(
    private readonly service: CrmBridgeService,
    private readonly rateLimiting: RateLimitingService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string,
    @Headers('x-integration-id') integrationId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!signature || !integrationId) {
      throw new BadRequestException('Missing headers');
    }
    this.rateLimiting.assertWebhookAllowed(
      `bridge:crm:${integrationId}`,
      BRIDGE_WEBHOOK_RATE_LIMIT,
    );
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing raw body');
    }

    const result = await this.service.handleWebhook({
      rawBody,
      signature,
      integrationId,
      idempotencyKey,
    });

    return {
      received: true,
      tenantId: result.tenantId,
      eventId: result.eventId,
      alreadyProcessed: result.alreadyProcessed,
    };
  }
}
