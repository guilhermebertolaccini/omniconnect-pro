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
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../../common/utils/tenant-context';
import { crmActor, isBrokerOnly } from '../common/actor';
import { CrmClientsService } from './crm-clients.service';
import { CreateCrmClientDto, UpdateCrmClientDto } from './dto/clients.dto';

@Controller('crm/clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmClientsController {
  constructor(private readonly service: CrmClientsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  create(
    @CurrentUser() user: RequestUserLike,
    @Body() dto: CreateCrmClientDto,
  ) {
    const actor = crmActor(user);
    return this.service.create(
      ensureTenant(user),
      dto,
      // brokers auto-atribuem; admin/supervisor pode informar dto.brokerId
      isBrokerOnly(actor) ? actor.id : undefined,
    );
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('search') search?: string,
    @Query('brokerId') brokerIdRaw?: string,
  ) {
    const actor = crmActor(user);
    const brokerId = brokerIdRaw ? Number(brokerIdRaw) : undefined;
    const restrictToBroker = isBrokerOnly(actor);
    return this.service.findAll(ensureTenant(user), {
      search,
      brokerId: restrictToBroker ? actor.id : brokerId,
      restrictToBroker,
    });
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findOne(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.findOne(ensureTenant(user), id, crmActor(user));
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  update(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateCrmClientDto,
  ) {
    return this.service.update(ensureTenant(user), id, dto, crmActor(user));
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor)
  remove(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.remove(ensureTenant(user), id, crmActor(user));
  }
}
