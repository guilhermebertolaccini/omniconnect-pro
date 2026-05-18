import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../../common/utils/tenant-context';
import { CrmPropertiesService } from './crm-properties.service';
import {
  CommissionConfigDto,
  CreateCrmPropertyDto,
  UpdateCrmPropertyDto,
} from './dto/properties.dto';

@Controller('crm/properties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmPropertiesController {
  constructor(private readonly service: CrmPropertiesService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor)
  create(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: CreateCrmPropertyDto,
  ) {
    return this.service.create(
      ensureTenant(user),
      dto,
      typeof user.id === 'number' ? user.id : undefined,
    );
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(ensureTenant(user), search);
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findOne(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.findOne(ensureTenant(user), id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor)
  update(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateCrmPropertyDto,
  ) {
    return this.service.update(ensureTenant(user), id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.remove(ensureTenant(user), id);
  }

  // ---------------------------------------------------------------------------
  // Commission config
  // ---------------------------------------------------------------------------

  @Get(':id/commission-config')
  @Roles(Role.admin, Role.supervisor)
  getCommissionConfig(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
  ) {
    return this.service.getCommissionConfig(ensureTenant(user), id);
  }

  @Put(':id/commission-config')
  @Roles(Role.admin, Role.supervisor)
  setCommissionConfig(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Param('id') id: string,
    @Body() dto: CommissionConfigDto,
  ) {
    return this.service.setCommissionConfig(
      ensureTenant(user),
      id,
      dto,
      typeof user.id === 'number' ? user.id : undefined,
    );
  }
}
