import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CreateTenantInvitationDto } from './dto/create-tenant-invitation.dto';
import { AcceptTenantInvitationDto } from './dto/accept-tenant-invitation.dto';
import { TenantInvitationsService } from './tenant-invitations.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    tenantId: string;
    tenantRole?: Role | null;
    role?: Role;
  };
}

@ApiTags('tenant-invitations')
@Controller('tenant-invitations')
export class TenantInvitationsController {
  constructor(private readonly service: TenantInvitationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cria um invite para o tenant atual.' })
  @ApiResponse({
    status: 201,
    description:
      'Token retornado APENAS nesta resposta para envio por email; listagens posteriores nunca expõem o token.',
  })
  async create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() dto: CreateTenantInvitationDto,
  ) {
    if (!user?.tenantId) throw new BadRequestException('tenantId missing');
    const inviterRole = (user.tenantRole ?? user.role ?? null) as Role | null;
    return this.service.create(user.tenantId, user.id, inviterRole, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Lista invites do tenant atual (sem tokens).' })
  async list(@CurrentUser() user: AuthenticatedRequest['user']) {
    if (!user?.tenantId) throw new BadRequestException('tenantId missing');
    return this.service.listForTenant(user.tenantId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  @HttpCode(204)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoga um invite ainda não aceito.' })
  async revoke(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id') id: string,
  ) {
    if (!user?.tenantId) throw new BadRequestException('tenantId missing');
    await this.service.revoke(user.tenantId, id, user.id);
    return null;
  }

  // -------------------------------------------------------------------------
  // Fluxo público por token (sem JwtAuthGuard duro)
  // -------------------------------------------------------------------------

  @Get('by-token/:token')
  @ApiParam({ name: 'token', description: 'Token bruto do invite (URL).' })
  @ApiOperation({
    summary: 'Preview público do invite. Não expõe IDs sensíveis nem o token.',
  })
  async preview(@Param('token') token: string) {
    return this.service.preview(token);
  }

  @Post('by-token/:token/accept')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiParam({ name: 'token', description: 'Token bruto do invite (URL).' })
  @ApiOperation({
    summary:
      'Aceita o invite. Cobre 3 cenários: usuário autenticado, usuário existente (com password), usuário novo (name + password).',
  })
  async accept(
    @Param('token') token: string,
    @Body() body: AcceptTenantInvitationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const authenticatedUserId = req.user?.id ?? null;
    return this.service.accept(token, body ?? {}, authenticatedUserId);
  }
}
