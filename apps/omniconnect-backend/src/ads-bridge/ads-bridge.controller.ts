import { Controller, Post, Body, Headers, HttpCode, BadRequestException } from '@nestjs/common';
import { AdsBridgeService } from './ads-bridge.service';

@Controller('webhooks/ads')
export class AdsBridgeController {
  constructor(private readonly service: AdsBridgeService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Body() raw: any,
    @Headers('x-signature') signature: string,
    @Headers('x-integration-id') integrationId: string,
  ) {
    if (!signature || !integrationId) throw new BadRequestException('Missing headers');
    
    this.service.verifySignature(raw, signature, integrationId);
    const tenantId = await this.service.resolveTenantFromIntegration(integrationId);

    // TODO: queue processing
    return { received: true, tenantId };
  }
}
