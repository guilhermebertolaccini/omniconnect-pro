import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BotBridgeService {
  constructor(private readonly prisma: PrismaService) {}

  verifySignature(raw: any, signature: string, integrationId: string) {
    if (!signature || signature.trim() === '') {
      throw new UnauthorizedException('Invalid or missing signature');
    }
    // Em produção, deve verificar HMAC usando secret do tenant
    return true;
  }

  async resolveTenantFromIntegration(integrationId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: integrationId }
    });

    if (!tenant || !tenant.isActive) {
      if (process.env.NODE_ENV === 'production') {
        throw new NotFoundException('Tenant not found or inactive');
      }
      return 'default-tenant';
    }

    return tenant.id;
  }
}
