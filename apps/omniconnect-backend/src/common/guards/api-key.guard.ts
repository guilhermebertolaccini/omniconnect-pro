import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantApiKeysService } from '../../tenant-api-keys/tenant-api-keys.service';

/**
 * Authenticates server-to-server callers.
 *
 * Resolution order:
 *   1. Look up the plaintext bearer token against `TenantApiKey.hashedKey`.
 *      On hit, attach `req.tenantId`, `req.apiKey` and proceed.
 *   2. Fallback to the legacy static `API_KEY` env var, but only outside
 *      production. The fallback uses `default-tenant` and emits a warning
 *      every time it kicks in so production callers must migrate.
 *
 * In production, missing/unknown tokens are rejected with 401.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private configService: ConfigService,
    private tenantApiKeys: TenantApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Token de autenticação não fornecido');
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('Token de autenticação não fornecido');
    }

    const resolved = await this.tenantApiKeys.resolve(token);
    if (resolved) {
      request.tenantId = resolved.tenantId;
      request.apiKey = {
        id: resolved.id,
        label: resolved.label,
        prefix: resolved.prefix,
      };
      return true;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const legacyKey = this.configService.get<string>('API_KEY');

    if (!isProduction && legacyKey && token === legacyKey) {
      this.logger.warn(
        'Legacy static API_KEY accepted (NODE_ENV != production). ' +
          'Issue a TenantApiKey before deploying to production.',
      );
      request.tenantId = 'default-tenant';
      request.apiKey = {
        id: 'legacy-env',
        label: 'legacy env API_KEY',
        prefix: 'legacy',
      };
      return true;
    }

    throw new UnauthorizedException('Token de autenticação inválido');
  }
}
