import { Controller, Post, Body, Headers, HttpCode, BadRequestException } from '@nestjs/common';
import { CrmBridgeService } from './crm-bridge.service';

@Controller('webhooks/crm')
export class CrmBridgeController {
  constructor(private readonly service: CrmBridgeService) {}

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
