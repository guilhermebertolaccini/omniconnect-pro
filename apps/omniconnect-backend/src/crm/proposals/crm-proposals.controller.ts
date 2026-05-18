import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CrmProposalStatus, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../../common/utils/tenant-context';
import { crmActor } from '../common/actor';
import { CrmProposalsService } from './crm-proposals.service';
import {
  CreateCrmProposalDto,
  TransitionCrmProposalDto,
  UpdateCrmProposalDto,
} from './dto/proposals.dto';

@Controller('crm/proposals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmProposalsController {
  constructor(private readonly service: CrmProposalsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  create(
    @CurrentUser() user: RequestUserLike,
    @Body() dto: CreateCrmProposalDto,
  ) {
    return this.service.create(ensureTenant(user), dto, crmActor(user));
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('status') status?: CrmProposalStatus,
  ) {
    return this.service.findAll(ensureTenant(user), crmActor(user), status);
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findOne(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.findOne(ensureTenant(user), id, crmActor(user));
  }

  @Get(':id/events')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  listEvents(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.listEvents(ensureTenant(user), id, crmActor(user));
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  update(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateCrmProposalDto,
  ) {
    return this.service.update(ensureTenant(user), id, dto, crmActor(user));
  }

  @Post(':id/transition')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  transition(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: TransitionCrmProposalDto,
  ) {
    return this.service.transition(
      ensureTenant(user),
      id,
      dto,
      crmActor(user),
    );
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor)
  remove(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.remove(ensureTenant(user), id, crmActor(user));
  }
}
