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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private refreshTokens: RefreshTokenService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return null;
      }

      // Verificar se a senha está no formato correto (hash do argon2)
      // Se não for um hash válido, pode ser que a senha esteja em texto plano (desenvolvimento)
      let isPasswordValid = false;
      try {
        isPasswordValid = await argon2.verify(user.password, password);
      } catch (error) {
        // Se der erro na verificação, pode ser que a senha não seja um hash válido
        // Em desenvolvimento, pode estar em texto plano
        if (process.env.NODE_ENV === 'development' && user.password === password) {
          isPasswordValid = true;
        } else {
          this.logger?.error?.('Erro ao verificar senha:', error);
          return null;
        }
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
    if (user.role === 'operator') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'Online' },
      });
    }

    const userTenants = await this.prisma.userTenant.findMany({
      where: { userId: user.id },
    });
    const activeTenantId =
      userTenants.length > 0 ? userTenants[0].tenantId : 'default-tenant';

    const session = await this.refreshTokens.issue(
      { id: user.id, email: user.email, role: user.role },
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
        role: user.role,
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
      { id: created.user.id, email: created.user.email, role: created.user.role },
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
}
