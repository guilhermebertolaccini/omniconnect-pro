import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  /**
   * JWT validation runs on every authenticated request. Beyond verifying
   * the user exists, we ALSO re-check membership in the claimed tenant
   * via UserTenant — so a stolen/old token from a user who was kicked
   * out of a tenant stops working immediately, without waiting for the
   * token to expire. The membership query also gives us the
   * tenant-specific Role (the `User.role` column is a global default;
   * the source of truth for "what can this user do in THIS tenant" is
   * UserTenant.role). RolesGuard reads `user.tenantRole` first and only
   * falls back to `user.role` if no per-tenant role is present.
   */
  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    const rawTenantId = payload.tenantId;
    const inProd = process.env.NODE_ENV === 'production';

    if (inProd && (!rawTenantId || rawTenantId === 'default-tenant')) {
      throw new UnauthorizedException('Tenant not explicitly defined in production context');
    }

    const tenantId = rawTenantId || 'default-tenant';

    let tenantRole: string | null = null;
    if (rawTenantId && rawTenantId !== 'default-tenant') {
      const membership = await this.prisma.userTenant.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId } },
        select: { role: true },
      });

      if (!membership) {
        if (inProd) {
          throw new UnauthorizedException(
            'User is not a member of the requested tenant',
          );
        }
        this.logger.warn(
          `[dev] user ${user.id} has no UserTenant row for tenantId=${tenantId}; allowing in non-production.`,
        );
      } else {
        tenantRole = membership.role;
      }
    }

    return { ...user, tenantId, tenantRole };
  }
}
