import { Controller, Post, Body, Headers, HttpCode, BadRequestException } from '@nestjs/common';
import { BotBridgeService } from './bot-bridge.service';

@Controller('webhooks/botify')
export class BotBridgeController {
  constructor(private readonly service: BotBridgeService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Body() raw: any,
    @Headers('x-signature') signature: string,
    @Headers('x-integration-id') integrationId: string,
  ) {
    if (!signature || !integrationId) throw new BadRequestException('Missing headers');
    
    const tenantId = await this.service.authenticateAndResolveTenant(raw, signature, integrationId);

    // TODO: queue processing
    return { received: true, tenantId };
  }
}
