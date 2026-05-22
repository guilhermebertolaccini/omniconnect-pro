import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { LineHealthService } from './line-health.service';
import { UpsertLineHealthPolicyDto } from './dto/upsert-line-health-policy.dto';

@ApiTags('line-health')
@Controller('line-health')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class LineHealthController {
  constructor(private readonly service: LineHealthService) {}

  @Get('lines')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary:
      'Lista LinesStock do tenant com `LineReputation` calculado on-the-fly.',
  })
  listLines(@CurrentUser() user: RequestUserLike) {
    const tenantId = ensureTenant(user);
    return this.service.listLines(tenantId);
  }

  @Get('policy')
  @Roles(Role.admin, Role.supervisor)
  @ApiOperation({
    summary: 'Política de saúde da linha do tenant (cria com defaults).',
  })
  getPolicy(@CurrentUser() user: RequestUserLike & { id?: number }) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.getPolicy(tenantId, actorId);
  }

  @Put('policy')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Upsert da política de saúde da linha (alertas + ações automáticas).',
  })
  upsertPolicy(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: UpsertLineHealthPolicyDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.upsertPolicy(tenantId, dto, actorId);
  }
}
