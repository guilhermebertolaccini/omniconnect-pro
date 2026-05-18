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
import { BotBridgeService } from './bot-bridge.service';
import { RateLimitingService } from '../rate-limiting/rate-limiting.service';

const BRIDGE_WEBHOOK_RATE_LIMIT = { maxRequests: 120, windowMs: 60_000 };

@Controller('webhooks/botify')
export class BotBridgeController {
  constructor(
    private readonly service: BotBridgeService,
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
      `bridge:botify:${integrationId}`,
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
