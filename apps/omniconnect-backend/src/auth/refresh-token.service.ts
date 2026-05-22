import {
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';

export interface IssuedSession {
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  refreshTokenId: string;
}

export interface IssueContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Auth pair (access JWT + refresh DB-backed). Rotação encadeada: cada call de
 * `rotate` revoga o token apresentado e emite um novo, lincando os dois via
 * `successorId`. Reuse de um token JÁ revogado é tratado como roubo: revogamos
 * a cadeia inteira do usuário e auditamos.
 *
 * Access token: JWT curto (ACCESS_TOKEN_TTL_SECONDS, default 900s).
 * Refresh token: segredo cru (64 hex) entregue só no HttpOnly cookie; no banco
 * persiste apenas SHA-256(`tokenHash`). TTL configurável via
 * REFRESH_TOKEN_TTL_DAYS (default 30).
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  readonly accessTtlSeconds: number;
  readonly refreshTtlMs: number;
  readonly cookieName: string;
  readonly cookiePath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() @Inject(SystemEventsService)
    private readonly systemEvents: SystemEventsService | null,
  ) {
    this.accessTtlSeconds = this.parseInt('ACCESS_TOKEN_TTL_SECONDS', 15 * 60, 60, 24 * 60 * 60);
    const refreshDays = this.parseInt('REFRESH_TOKEN_TTL_DAYS', 30, 1, 365);
    this.refreshTtlMs = refreshDays * 24 * 60 * 60 * 1000;
    this.cookieName = this.config.get<string>('REFRESH_COOKIE_NAME') || 'oc_refresh';
    this.cookiePath = this.config.get<string>('REFRESH_COOKIE_PATH') || '/auth';
  }

  // ---------------------------------------------------------------------------
  // Emissão / rotação / revogação
  // ---------------------------------------------------------------------------

  /**
   * Emite um par fresco (access JWT + refresh row) para o user no tenant
   * informado. Não revoga sessões anteriores — login concorrente é permitido.
   */
  async issue(
    user: { id: number; email: string; role: string },
    tenantId: string,
    ctx: IssueContext = {},
  ): Promise<IssuedSession> {
    return this.create({ user, tenantId, ctx });
  }

  /**
   * Roteia uma sessão: valida o refresh apresentado, revoga-o, emite um novo
   * lincado via `successorId`. Detecta reuse e revoga a cadeia em caso de
   * fraude.
   */
  async rotate(
    presentedToken: string | null,
    ctx: IssueContext = {},
  ): Promise<IssuedSession> {
    if (!presentedToken || presentedToken.length < 32) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const tokenHash = this.hash(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) {
      // Token desconhecido — pode ser tentativa cega; não auditamos um userId
      // que não temos.
      throw new UnauthorizedException('Invalid refresh token');
    }

    const now = new Date();

    // ── Reuse detection ────────────────────────────────────────────────────
    // Token apresentado JÁ tinha sido rotacionado: alguém entrou com um
    // token "velho", que só faz sentido se foi roubado. Revogamos toda a
    // cadeia de refresh do usuário.
    if (existing.revokedAt || existing.successorId) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      void this.audit(
        existing.tenantId,
        existing.userId,
        EventType.AUTH_REFRESH_REUSE_DETECTED,
        EventSeverity.ERROR,
        { tokenId: existing.id },
      );
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    if (existing.expiresAt.getTime() < now.getTime()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!existing.user) {
      throw new UnauthorizedException('Owner of refresh token no longer exists');
    }

    const issued = await this.create({
      user: {
        id: existing.user.id,
        email: existing.user.email,
        role: existing.user.role,
      },
      tenantId: existing.tenantId,
      ctx,
    });

    // Linka old -> new e revoga o velho.
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { successorId: issued.refreshTokenId, revokedAt: now },
    });

    return issued;
  }

  /**
   * Revoga um refresh específico (logout single-session). Idempotente. Aceita
   * token bruto ou tokenHash.
   */
  async revoke(presentedToken: string | null): Promise<void> {
    if (!presentedToken) return;
    const tokenHash = this.hash(presentedToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoga TODAS as sessões ativas de um user (logout all / kill switch). */
  async revokeAllForUser(userId: number): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Cookie config (consumida pelo controller)
  // ---------------------------------------------------------------------------

  /**
   * Permite override explícito via `COOKIE_SECURE` env (Sprint Hub / PR 6).
   * Em staging-mirror local (HTTP em localhost), o operador define
   * `COOKIE_SECURE=false` para o browser aceitar o cookie. Em produção real
   * (HTTPS), o default `NODE_ENV=production` ⇒ `Secure=true` continua valendo.
   */
  private resolveSecureFlag(): boolean {
    const explicit = process.env.COOKIE_SECURE;
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return process.env.NODE_ENV === 'production';
  }

  buildCookieOptions(expiresAt?: Date) {
    return {
      httpOnly: true,
      secure: this.resolveSecureFlag(),
      sameSite: 'lax' as const,
      path: this.cookiePath,
      expires: expiresAt,
    };
  }

  buildClearCookieOptions() {
    return {
      httpOnly: true,
      secure: this.resolveSecureFlag(),
      sameSite: 'lax' as const,
      path: this.cookiePath,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async create({
    user,
    tenantId,
    ctx,
  }: {
    user: { id: number; email: string; role: string };
    tenantId: string;
    ctx: IssueContext;
  }): Promise<IssuedSession> {
    if (!tenantId) {
      throw new UnauthorizedException('tenantId missing');
    }

    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role, tenantId },
      { expiresIn: this.accessTtlSeconds },
    );

    const refreshToken = randomBytes(32).toString('hex');
    const tokenHash = this.hash(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);

    const row = await this.prisma.refreshToken.create({
      data: {
        tenantId,
        userId: user.id,
        tokenHash,
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      accessExpiresIn: this.accessTtlSeconds,
      refreshToken,
      refreshExpiresAt,
      refreshTokenId: row.id,
    };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private parseInt(env: string, fallback: number, min: number, max: number): number {
    const raw = this.config.get<string>(env);
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed)) return fallback;
    const clamped = Math.max(min, Math.min(max, Math.trunc(parsed)));
    return clamped;
  }

  private async audit(
    tenantId: string,
    userId: number | null,
    type: EventType,
    severity: EventSeverity,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.systemEvents) return;
    try {
      await this.systemEvents.logEvent(
        type,
        EventModule.AUTH,
        payload,
        userId,
        severity,
        tenantId,
      );
    } catch (err) {
      this.logger.warn(`Failed to audit ${type}: ${(err as Error).message}`);
    }
  }
}
