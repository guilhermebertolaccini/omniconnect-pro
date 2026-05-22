import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { AntiFatigueService } from './anti-fatigue.service';
import { UpsertAntiFatigueRuleDto } from './dto/upsert-rule.dto';
import { ListDedupeLogQueryDto } from './dto/list-dedupe-log-query.dto';

@ApiTags('anti-fatigue')
@Controller('anti-fatigue')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class AntiFatigueController {
  constructor(private readonly service: AntiFatigueService) {}

  @Get('rule')
  @Roles(Role.admin, Role.supervisor)
  @ApiOperation({
    summary:
      'Retorna a regra de anti-fadiga do tenant. Cria com defaults se não existir.',
  })
  getMyRule(@CurrentUser() user: RequestUserLike & { id?: number }) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.getMyRule(tenantId, actorId);
  }

  @Put('rule')
  @Roles(Role.admin)
  @ApiOperation({
    summary:
      'Upsert da regra de anti-fadiga do tenant (janela, applies-to, horário, bypass).',
  })
  upsertMyRule(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: UpsertAntiFatigueRuleDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.upsertMyRule(tenantId, dto, actorId);
  }

  @Get('dedupe-log')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary:
      'Lista paginada de blocks por anti-fadiga (auditoria). Filtros: contactKey, channel, from/to.',
  })
  listDedupeLog(
    @CurrentUser() user: RequestUserLike,
    @Query() query: ListDedupeLogQueryDto,
  ) {
    const tenantId = ensureTenant(user);
    return this.service.listDedupeLog(tenantId, query);
  }
}
