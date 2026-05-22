import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { Leads360Service } from './leads-360.service';
import { ListLeads360QueryDto } from './dto/list-leads-360-query.dto';

@ApiTags('leads-360')
@Controller('leads/360')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class Leads360Controller {
  constructor(private readonly service: Leads360Service) {}

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.digital, Role.operator, Role.broker)
  @ApiOperation({
    summary:
      'Lista cross-channel paginada (Contact + última análise IA + CrmLead match + counts).',
  })
  list(
    @CurrentUser() user: RequestUserLike,
    @Query() query: ListLeads360QueryDto,
  ) {
    const tenantId = ensureTenant(user);
    return this.service.list(tenantId, query);
  }

  @Get(':contactId')
  @Roles(Role.admin, Role.supervisor, Role.digital, Role.operator, Role.broker)
  @ApiOperation({
    summary:
      'Detalhe Leads 360° — Contact + CrmLead + última análise + timeline (50 últimas mensagens, 20 análises, 20 handoffs, 20 interações CRM).',
  })
  findOne(
    @CurrentUser() user: RequestUserLike,
    @Param('contactId', ParseIntPipe) contactId: number,
  ) {
    const tenantId = ensureTenant(user);
    return this.service.findOne(tenantId, contactId);
  }
}
