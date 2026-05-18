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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { AdPlatformConnectionsService } from './ad-platform-connections.service';
import { CreateAdPlatformConnectionDto } from './dto/create-ad-platform-connection.dto';
import { UpdateAdPlatformConnectionDto } from './dto/update-ad-platform-connection.dto';

@Controller('ad-platform-connections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdPlatformConnectionsController {
  constructor(private readonly service: AdPlatformConnectionsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor)
  create(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: CreateAdPlatformConnectionDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.create(tenantId, dto, actorId);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.operator)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('advertiserCompanyId') advertiserCompanyId?: string,
  ) {
    const tenantId = ensureTenant(user);
    return this.service.findAll(tenantId, advertiserCompanyId);
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.operator)
  findOne(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    const tenantId = ensureTenant(user);
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor)
  update(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateAdPlatformConnectionDto,
  ) {
    const tenantId = ensureTenant(user);
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    const tenantId = ensureTenant(user);
    return this.service.remove(tenantId, id);
  }

  @Post(':id/test')
  @Roles(Role.admin, Role.supervisor)
  test(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    const tenantId = ensureTenant(user);
    return this.service.testConnection(tenantId, id);
  }
}
