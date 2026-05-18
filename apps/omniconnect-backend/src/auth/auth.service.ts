import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as argon2 from 'argon2';
import { IssueContext, RefreshTokenService } from './refresh-token.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private refreshTokens: RefreshTokenService,
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

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
