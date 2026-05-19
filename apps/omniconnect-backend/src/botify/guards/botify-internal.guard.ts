import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isValidBotifySyncTenantId } from '@omniconnect/shared-types';
import { Request } from 'express';

export type BotifyInternalRequest = Request & { botifyInternalTenantId?: string };

/**
 * Server-to-server: `Authorization: Bearer ${BOTIFY_INTERNAL_SYNC_SECRET}` +
 * `X-Omni-Tenant-Id` (tenant Prisma escopado ao fluxo; UUID ou slug, ex.: `default-tenant` do seed).
 */
@Injectable()
export class BotifyInternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<BotifyInternalRequest>();
    const secret = process.env.BOTIFY_INTERNAL_SYNC_SECRET?.trim();
    if (!secret) {
      throw new UnauthorizedException('BOTIFY_INTERNAL_SYNC_SECRET is not configured');
    }

    const auth = String(req.headers.authorization ?? '').trim();
    if (auth !== `Bearer ${secret}`) {
      throw new UnauthorizedException('Invalid internal authorization');
    }

    const tenantId = String(req.headers['x-omni-tenant-id'] ?? '').trim();
    if (!tenantId || !isValidBotifySyncTenantId(tenantId)) {
      throw new BadRequestException(
        'Valid X-Omni-Tenant-Id header is required (alphanumeric slug or UUID)',
      );
    }

    req.botifyInternalTenantId = tenantId;
    return true;
  }
}
