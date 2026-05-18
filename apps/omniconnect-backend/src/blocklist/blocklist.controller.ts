import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { BlocklistService } from './blocklist.service';
import { CreateBlocklistDto } from './dto/create-blocklist.dto';
import { UpdateBlocklistDto } from './dto/update-blocklist.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';
import { Role } from '@prisma/client';

@Controller('blocklist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlocklistController {
  constructor(private readonly blocklistService: BlocklistService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  create(@CurrentUser() user: any, @Body() createBlocklistDto: CreateBlocklistDto) {
    return this.blocklistService.create(ensureTenant(user), createBlocklistDto);
  }

  @Get()
  findAll(@CurrentUser() user: any, @Query('search') search?: string) {
    return this.blocklistService.findAll(ensureTenant(user), search);
  }

  @Get('check')
  async check(
    @CurrentUser() user: any,
    @Query('phone') phone?: string,
    @Query('cpf') cpf?: string,
  ) {
    const isBlocked = await this.blocklistService.isBlocked(ensureTenant(user), phone, cpf);
    return { blocked: isBlocked };
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.blocklistService.findOne(ensureTenant(user), +id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateBlocklistDto: UpdateBlocklistDto,
  ) {
    return this.blocklistService.update(ensureTenant(user), +id, updateBlocklistDto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.blocklistService.remove(ensureTenant(user), +id);
  }
}
