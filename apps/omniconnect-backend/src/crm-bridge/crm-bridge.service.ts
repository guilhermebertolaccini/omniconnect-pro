import { Injectable } from '@nestjs/common';

@Injectable()
export class CrmBridgeService {
  verifySignature(raw: any, signature: string, integrationId: string) {
    // TODO: implement signature verification
    return true;
  }

  async resolveTenantFromIntegration(integrationId: string) {
    // TODO: implement tenant resolution
    return "default-tenant";
  }
}
