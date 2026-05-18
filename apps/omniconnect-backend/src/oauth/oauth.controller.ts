import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdPlatform } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OAuthService } from './oauth.service';

interface AuthenticatedUser {
  id: number;
  tenantId: string;
}

const SUPPORTED_PLATFORMS: AdPlatform[] = [
  AdPlatform.meta,
  AdPlatform.google_ads,
  AdPlatform.tiktok_ads,
];

function parsePlatform(raw: string): AdPlatform {
  if (!SUPPORTED_PLATFORMS.includes(raw as AdPlatform)) {
    throw new BadRequestException(`Unsupported platform: ${raw}`);
  }
  return raw as AdPlatform;
}

@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(private readonly service: OAuthService) {}

  // ---------------------------------------------------------------------------
  // Start — autenticado, devolve { authorizeUrl }
  // ---------------------------------------------------------------------------

  @Get(':platform/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'platform', enum: SUPPORTED_PLATFORMS })
  @ApiQuery({ name: 'advertiserCompanyId', required: true })
  @ApiQuery({
    name: 'returnUrl',
    required: false,
    description: 'Path relativo do frontend para onde redirecionar após o callback.',
  })
  @ApiOperation({
    summary:
      'Gera a URL de autorização do provider já com state cifrado (AES-256-GCM, TTL 5min).',
  })
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platform') platform: string,
    @Query('advertiserCompanyId') advertiserCompanyId: string,
    @Query('returnUrl') returnUrl?: string,
  ) {
    if (!advertiserCompanyId) {
      throw new BadRequestException('advertiserCompanyId is required');
    }
    const plat = parsePlatform(platform);
    return this.service.buildAuthorizeUrl({
      tenantId: user.tenantId,
      userId: user.id,
      advertiserCompanyId,
      platform: plat,
      returnUrl: returnUrl ?? null,
    });
  }

  // ---------------------------------------------------------------------------
  // Callback — público, provider redireciona aqui
  // ---------------------------------------------------------------------------

  @Get(':platform/callback')
  @ApiParam({ name: 'platform', enum: SUPPORTED_PLATFORMS })
  @ApiOperation({
    summary:
      'Recebe o code+state do provider, fecha o exchange server-side, cifra os tokens e redireciona o usuário de volta ao frontend.',
  })
  async callback(
    @Param('platform') platform: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') errorParam: string | undefined,
    @Res() res: Response,
  ) {
    const plat = parsePlatform(platform);

    if (errorParam) {
      const url = this.service.buildFrontendBounceUrl(plat, {
        status: 'error',
        error: errorParam,
      });
      return res.redirect(302, url);
    }

    try {
      const result = await this.service.handleCallback({
        platform: plat,
        code,
        state,
        actingUserId: null,
      });
      const url = this.service.buildFrontendBounceUrl(plat, {
        status: 'success',
        connectionId: result.connectionId,
        returnUrl: result.returnUrl,
      });
      return res.redirect(302, url);
    } catch (err) {
      const url = this.service.buildFrontendBounceUrl(plat, {
        status: 'error',
        error: (err as Error).message ?? 'callback failed',
      });
      return res.redirect(302, url);
    }
  }
}
