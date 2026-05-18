import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AdsBridgeService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticateAndResolveTenant(raw: any, signature: string, integrationId: string): Promise<string> {
    if (!signature || signature.trim() === '') {
      throw new UnauthorizedException('Invalid or missing signature');
    }

    const connection = await this.prisma.integrationConnection.findUnique({
      where: { id: integrationId },
      include: { tenant: true }
    });

    if (!connection || connection.status !== 'active' || !connection.tenant.isActive) {
      if (process.env.NODE_ENV === 'production') {
        throw new NotFoundException('Integration not found or inactive');
      }
      return 'default-tenant';
    }

    if (process.env.NODE_ENV === 'production') {
      const crypto = require('crypto');
      const payloadString = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const expectedSignature = crypto.createHmac('sha256', connection.secretHash).update(payloadString).digest('hex');
      
      try {
        const isSignatureValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
        if (!isSignatureValid) {
          throw new UnauthorizedException('Invalid signature');
        }
      } catch (e) {
        throw new UnauthorizedException('Invalid signature format');
      }
    }

    return connection.tenantId;
  }
}
