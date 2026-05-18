import {
  BadRequestException,
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
import { CrmUnitStatus, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../../common/utils/tenant-context';
import { CrmUnitsService } from './crm-units.service';
import {
  CreateCrmUnitDto,
  UpdateCrmUnitDto,
  UpdateCrmUnitStatusDto,
} from './dto/units.dto';

@Controller('crm/units')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmUnitsController {
  constructor(private readonly service: CrmUnitsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor)
  create(
    @CurrentUser() user: RequestUserLike,
    @Body() dto: CreateCrmUnitDto,
  ) {
    return this.service.create(ensureTenant(user), dto);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('propertyId') propertyId?: string,
    @Query('status') status?: string,
  ) {
    if (status && !(Object.values(CrmUnitStatus) as string[]).includes(status)) {
      throw new BadRequestException(`Unsupported status "${status}"`);
    }
    return this.service.findAll(ensureTenant(user), {
      propertyId,
      status: status as CrmUnitStatus | undefined,
    });
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
    @Body() dto: UpdateCrmUnitDto,
  ) {
    return this.service.update(ensureTenant(user), id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  updateStatus(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateCrmUnitStatusDto,
  ) {
    return this.service.updateStatus(ensureTenant(user), id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.remove(ensureTenant(user), id);
  }
}
