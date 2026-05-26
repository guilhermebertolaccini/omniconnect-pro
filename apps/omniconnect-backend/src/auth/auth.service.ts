import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import * as argon2 from 'argon2';
import { IssueContext, RefreshTokenService } from './refresh-token.service';
import { RegisterDto } from './dto/register.dto';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private refreshTokens: RefreshTokenService,
    private config: ConfigService,
    private systemEvents: SystemEventsService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return null;
      }

      let isPasswordValid = false;
      try {
        isPasswordValid = await argon2.verify(user.password, password);
      } catch (error) {
        this.logger?.error?.('Erro ao verificar senha:', error);
        return null;
      }

      if (!isPasswordValid) {
        return null;
      }

      const { password: _, ...result } = user;
      return result;
    } catch (error) {
      console.error('Erro no validateUser:', error);
      throw error;
    }
  }

  async login(user: any, ctx: IssueContext = {}) {
    const userTenants = await this.prisma.userTenant.findMany({
      where: { userId: user.id },
      include: { tenant: { select: { isActive: true } } },
    });
    const inProd = process.env.NODE_ENV === 'production';
    const activeTenant = inProd
      ? userTenants.find(
          (membership) =>
            membership.tenantId !== 'default-tenant' &&
            membership.tenant?.isActive !== false,
        )
      : userTenants.find((membership) => membership.tenant?.isActive !== false);

    if (inProd && !activeTenant) {
      throw new UnauthorizedException(
        'User is not assigned to a production tenant',
      );
    }

    const activeTenantId = activeTenant?.tenantId ?? 'default-tenant';
    const activeRole = activeTenant?.role ?? user.role;

    if (user.role === 'operator') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'Online' },
      });
    }

    const session = await this.refreshTokens.issue(
      { id: user.id, email: user.email, role: activeRole },
      activeTenantId,
      ctx,
    );

    return {
      access_token: session.accessToken,
      access_expires_in: session.accessExpiresIn,
      refresh_token: session.refreshToken,
      refresh_expires_at: session.refreshExpiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: activeRole,
        segment: user.segment,
        line: user.line,
        status: user.role === 'operator' ? 'Online' : user.status,
        oneToOneActive: user.oneToOneActive,
        tenantId: activeTenantId,
      },
    };
  }

  /**
   * Roteia uma sessão a partir do refresh token bruto. Devolve o mesmo shape
   * de `login` (sem o `user`, já que o caller já está autenticado).
   */
  async refresh(presentedToken: string | null, ctx: IssueContext = {}) {
    const session = await this.refreshTokens.rotate(presentedToken, ctx);

    return {
      access_token: session.accessToken,
      access_expires_in: session.accessExpiresIn,
      refresh_token: session.refreshToken,
      refresh_expires_at: session.refreshExpiresAt,
    };
  }

  /**
   * Troca o escopo efetivo da sessao. O tenant solicitado nunca e aceito a
   * partir do client sem validar UserTenant e o estado ativo do tenant.
   */
  async switchTenant(
    userId: number,
    currentTenantId: string,
    requestedTenantId: string,
    presentedToken: string | null,
    ctx: IssueContext = {},
  ) {
    const membership = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId, tenantId: requestedTenantId },
      },
      include: { user: true, tenant: true },
    });

    if (
      !membership ||
      !membership.user?.isActive ||
      !membership.tenant?.isActive
    ) {
      await this.auditTenantSwitch(
        currentTenantId,
        userId,
        EventType.AUTH_TENANT_SWITCH_REJECTED,
        EventSeverity.WARNING,
        { requestedTenantId },
      );
      throw new UnauthorizedException('Tenant unavailable for this user');
    }

    let session;
    try {
      session = await this.refreshTokens.rotateToTenant(
        presentedToken,
        {
          id: membership.user.id,
          email: membership.user.email,
          role: membership.role,
        },
        membership.tenantId,
        ctx,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.auditTenantSwitch(
          currentTenantId,
          userId,
          EventType.AUTH_TENANT_SWITCH_REJECTED,
          EventSeverity.WARNING,
          { requestedTenantId },
        );
      }
      throw error;
    }

    await this.auditTenantSwitch(
      membership.tenantId,
      userId,
      EventType.AUTH_TENANT_SWITCHED,
      EventSeverity.SUCCESS,
      { previousTenantId: currentTenantId, tenantId: membership.tenantId },
    );

    return {
      access_token: session.accessToken,
      access_expires_in: session.accessExpiresIn,
      refresh_token: session.refreshToken,
      refresh_expires_at: session.refreshExpiresAt,
      user: {
        id: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role,
        segment: membership.user.segment,
        line: membership.user.line,
        status: membership.user.status,
        oneToOneActive: membership.user.oneToOneActive,
        tenantId: membership.tenantId,
      },
    };
  }

  /**
   * Logout single-session: revoga somente o refresh apresentado (cookie). Se o
   * caller é operator, marca status como Offline.
   */
  async logout(userId: number, presentedRefresh: string | null) {
    await this.refreshTokens.revoke(presentedRefresh);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.role === 'operator') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: 'Offline' },
      });
    }

    return { message: 'Logout realizado com sucesso' };
  }

  /**
   * Logout all-sessions: revoga toda a cadeia ativa de refresh do user.
   */
  async logoutAll(userId: number) {
    const revoked = await this.refreshTokens.revokeAllForUser(userId);
    return { message: 'Sessões encerradas', revoked };
  }

  /**
   * Self-service signup: cria User + Tenant + UserTenant(admin) numa única
   * transação e emite um par access+refresh.
   *
   * Gating:
   *   - `ALLOW_PUBLIC_TENANT_SIGNUP` env. Default `true` em dev/test e
   *     `false` em produção. Em produção, exigir override explícito.
   *   - Tenant name não pode colidir case-insensitive com `'platform'`,
   *     que é reservado para super-admins.
   */
  async register(dto: RegisterDto, ctx: IssueContext = {}) {
    if (!this.isSignupAllowed()) {
      throw new ForbiddenException('Self-service signup is disabled');
    }

    const email = dto.email.trim().toLowerCase();
    const tenantName = dto.tenantName.trim();
    if (tenantName.toLowerCase() === 'platform') {
      throw new BadRequestException('Tenant name is reserved');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: tenantName },
      });
      const user = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email,
          password: passwordHash,
          role: Role.admin,
        },
      });
      await tx.userTenant.create({
        data: { userId: user.id, tenantId: tenant.id, role: Role.admin },
      });
      return { tenant, user };
    });

    const session = await this.refreshTokens.issue(
      {
        id: created.user.id,
        email: created.user.email,
        role: created.user.role,
      },
      created.tenant.id,
      ctx,
    );

    return {
      access_token: session.accessToken,
      access_expires_in: session.accessExpiresIn,
      refresh_token: session.refreshToken,
      refresh_expires_at: session.refreshExpiresAt,
      user: {
        id: created.user.id,
        name: created.user.name,
        email: created.user.email,
        role: created.user.role,
        tenantId: created.tenant.id,
      },
      tenant: {
        id: created.tenant.id,
        name: created.tenant.name,
      },
    };
  }

  private isSignupAllowed(): boolean {
    const raw = this.config.get<string>('ALLOW_PUBLIC_TENANT_SIGNUP');
    if (raw === undefined || raw === '') {
      return process.env.NODE_ENV !== 'production';
    }
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  private async auditTenantSwitch(
    tenantId: string,
    userId: number,
    type: EventType,
    severity: EventSeverity,
    data: Record<string, string>,
  ): Promise<void> {
    await this.systemEvents.logEvent(
      type,
      EventModule.AUTH,
      data,
      userId,
      severity,
      tenantId || 'default-tenant',
    );
  }
}
