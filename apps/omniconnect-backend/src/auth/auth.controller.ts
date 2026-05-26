import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RefreshTokenService } from './refresh-token.service';

interface AuthenticatedUser {
  id: number;
  tenantId: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  @Post('login')
  @ApiOperation({ summary: 'Autenticar usuário' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login bem-sucedido' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const user = await this.authService.validateUser(
        loginDto.email,
        loginDto.password,
      );

      if (!user) {
        throw new UnauthorizedException('Credenciais inválidas');
      }

      const result = await this.authService.login(user, this.extractCtx(req));
      this.setRefreshCookie(
        res,
        result.refresh_token,
        result.refresh_expires_at,
      );
      return this.publicResponse(result);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Erro ao fazer login: ' + error.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Register — self-service signup (cria tenant + user + membership)
  // ---------------------------------------------------------------------------

  @Post('register')
  @ApiOperation({
    summary:
      'Cria uma nova conta + tenant (agência) e devolve o par access+refresh. ' +
      'Gated por ALLOW_PUBLIC_TENANT_SIGNUP.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Conta criada' })
  @ApiResponse({ status: 403, description: 'Self-service signup disabled' })
  @ApiResponse({ status: 409, description: 'Email já registrado' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, this.extractCtx(req));
    this.setRefreshCookie(res, result.refresh_token, result.refresh_expires_at);
    return this.publicResponse(result);
  }

  // ---------------------------------------------------------------------------
  // Refresh — público (lê cookie, não exige access JWT)
  // ---------------------------------------------------------------------------

  @Post('refresh')
  @ApiOperation({
    summary:
      'Rota o par access+refresh a partir do cookie HttpOnly. Detecção de reuse: ' +
      'apresentar um refresh já revogado revoga todas as sessões do usuário.',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookie = this.readRefreshCookie(req);
    const result = await this.authService.refresh(cookie, this.extractCtx(req));
    this.setRefreshCookie(res, result.refresh_token, result.refresh_expires_at);
    return this.publicResponse(result);
  }

  @Post('switch-tenant')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Troca a empresa ativa da sessao, validando membership e rotacionando o refresh cookie.',
  })
  @ApiBody({ type: SwitchTenantDto })
  @ApiResponse({
    status: 200,
    description: 'Sessao escopada ao tenant solicitado',
  })
  @ApiResponse({
    status: 401,
    description: 'Tenant indisponivel ou sessao invalida',
  })
  async switchTenant(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchTenantDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.switchTenant(
      user.id,
      user.tenantId,
      dto.tenantId,
      this.readRefreshCookie(req),
      this.extractCtx(req),
    );
    this.setRefreshCookie(res, result.refresh_token, result.refresh_expires_at);
    return this.publicResponse(result);
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Encerra a sessão atual (revoga só o refresh do cookie).',
  })
  async logout(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookie = this.readRefreshCookie(req);
    const result = await this.authService.logout(user.id, cookie);
    this.clearRefreshCookie(res);
    return result;
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoga todas as sessões ativas do usuário.' })
  async logoutAll(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logoutAll(user.id);
    this.clearRefreshCookie(res);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Me
  // ---------------------------------------------------------------------------

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.tenantRole ?? user.role,
      segment: user.segment,
      line: user.line,
      status: user.status,
      oneToOneActive: user.oneToOneActive,
      tenantId: user.tenantId,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers (cookie I/O + sanitização da resposta)
  // ---------------------------------------------------------------------------

  private readRefreshCookie(req: Request): string | null {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    if (!cookies) return null;
    return cookies[this.refreshTokens.cookieName] ?? null;
  }

  private setRefreshCookie(
    res: Response,
    token: string,
    expiresAt: Date,
  ): void {
    res.cookie(
      this.refreshTokens.cookieName,
      token,
      this.refreshTokens.buildCookieOptions(expiresAt),
    );
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(
      this.refreshTokens.cookieName,
      this.refreshTokens.buildClearCookieOptions(),
    );
  }

  private extractCtx(req: Request) {
    return {
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
      ipAddress:
        (req.headers['x-forwarded-for'] as string | undefined)
          ?.split(',')[0]
          ?.trim() ||
        req.ip ||
        null,
    };
  }

  /**
   * O refresh_token está no cookie HttpOnly — não devolvemos no body para
   * evitar que JS do frontend (ou um cliente de log) o capture. O frontend
   * só vê access_token.
   */
  private publicResponse<T extends { refresh_token?: string }>(payload: T) {
    const { refresh_token: _ignored, ...rest } = payload;
    return rest;
  }
}
