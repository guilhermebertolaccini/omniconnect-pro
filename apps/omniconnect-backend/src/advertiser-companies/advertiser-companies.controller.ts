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
import { AdPlatform, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { AdvertiserCompaniesService } from './advertiser-companies.service';
import { AdPlatformProxyService } from './ad-platform-proxy.service';
import {
  CreateAdvertiserCompanyDto,
  UpdateAdvertiserCompanyDto,
} from './dto/advertiser-company.dto';
import { PlatformProxyDto } from './dto/platform-proxy.dto';

@Controller('advertiser-companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdvertiserCompaniesController {
  constructor(
    private readonly companies: AdvertiserCompaniesService,
    private readonly proxy: AdPlatformProxyService,
  ) {}

  @Post()
  @Roles(Role.admin, Role.supervisor)
  create(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: CreateAdvertiserCompanyDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.companies.create(tenantId, dto, actorId);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const tenantId = ensureTenant(user);
    return this.companies.findAll(tenantId, search, status);
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findOne(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    const tenantId = ensureTenant(user);
    return this.companies.findOne(tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor)
  update(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateAdvertiserCompanyDto,
  ) {
    const tenantId = ensureTenant(user);
    return this.companies.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    const tenantId = ensureTenant(user);
    return this.companies.remove(tenantId, id);
  }

  /**
   * Outbound proxy to an external ad platform on behalf of one of this
   * advertiser company's configured connections.
   * Path param `platform` must match the AdPlatform enum.
   */
  @Post(':id/platforms/:platform/proxy')
  @Roles(Role.admin, Role.supervisor, Role.operator)
  proxyCall(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Param('id') advertiserCompanyId: string,
    @Param('platform') platform: string,
    @Body() dto: PlatformProxyDto,
  ) {
    const tenantId = ensureTenant(user);
    const validPlatform = this.parsePlatform(platform);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.proxy.proxy(tenantId, advertiserCompanyId, validPlatform, dto, actorId);
  }

  private parsePlatform(raw: string): AdPlatform {
    if ((Object.values(AdPlatform) as string[]).includes(raw)) {
      return raw as AdPlatform;
    }
    throw new BadRequestException(
      `Unsupported platform "${raw}". Allowed: ${Object.values(AdPlatform).join(', ')}`,
    );
  }
}
