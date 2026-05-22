import {
  BadRequestException,
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantsService, type MembershipDto } from './tenants.service';

interface JwtUser {
  id: number;
  tenantId?: string;
  tenantRole?: Role | null;
  role?: Role;
}

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  /**
   * Lista as memberships (`UserTenant`) do utilizador autenticado.
   * Apoia o tenant-selector do Hub (ADR-0003 §2).
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lista os tenants em que o utilizador autenticado é membro.',
  })
  async me(@CurrentUser() user: JwtUser): Promise<{ data: MembershipDto[] }> {
    if (!user?.id) throw new BadRequestException('userId missing');
    const data = await this.service.listMyMemberships(user.id);
    return { data };
  }
}
