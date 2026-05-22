import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PilotOverviewQueryDto } from './dto/pilot-overview-query.dto';
import { DashboardsService, type PilotOverview } from './dashboards.service';

interface JwtUser {
  id: number;
  tenantId?: string;
  tenantRole?: Role | null;
  role?: Role;
}

@ApiTags('dashboards')
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly service: DashboardsService) {}

  /**
   * A6 do piloto (ver `docs/migration/pilot-flow-lead-to-recovery.md` §7).
   *
   * Agregado tenant-scoped (admin / supervisor / digital). Sem leitura
   * cross-tenant — `tenantId` é resolvido do JWT e nunca do body / query.
   */
  @Get('pilot-overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor', 'digital')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Funil piloto agregado (leads → conversas → handoffs Botify → análises → recuperáveis). A6 do piloto.',
  })
  async pilotOverview(
    @CurrentUser() user: JwtUser,
    @Query() query: PilotOverviewQueryDto,
  ): Promise<{ data: PilotOverview }> {
    if (!user?.tenantId) throw new BadRequestException('tenantId missing');
    const data = await this.service.pilotOverview(user.tenantId, query);
    return { data };
  }
}
