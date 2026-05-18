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

@Controller('webhooks/botify')
export class BotBridgeController {
  constructor(private readonly service: BotBridgeService) {}

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
