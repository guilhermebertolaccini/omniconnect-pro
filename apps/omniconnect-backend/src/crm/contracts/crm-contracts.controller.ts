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
import { CrmContractStatus, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../../common/utils/tenant-context';
import { crmActor } from '../common/actor';
import { CrmContractsService } from './crm-contracts.service';
import {
  CreateCrmContractDto,
  TransitionCrmContractDto,
  UpdateCrmContractDto,
} from './dto/contracts.dto';

@Controller('crm/contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmContractsController {
  constructor(private readonly service: CrmContractsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  create(
    @CurrentUser() user: RequestUserLike,
    @Body() dto: CreateCrmContractDto,
  ) {
    return this.service.createFromProposal(
      ensureTenant(user),
      dto,
      crmActor(user),
    );
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('status') status?: CrmContractStatus,
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
    @Body() dto: UpdateCrmContractDto,
  ) {
    return this.service.update(ensureTenant(user), id, dto, crmActor(user));
  }

  @Post(':id/transition')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  transition(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: TransitionCrmContractDto,
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
