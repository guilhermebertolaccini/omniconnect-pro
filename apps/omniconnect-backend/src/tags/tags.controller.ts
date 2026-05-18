import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';
import { Role } from '@prisma/client';

@Controller('tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @Roles(Role.admin)
  create(@CurrentUser() user: any, @Body() createTagDto: CreateTagDto) {
    return this.tagsService.create(ensureTenant(user), createTagDto);
  }

  @Get()
  @Roles(Role.admin)
  findAll(@CurrentUser() user: any, @Query() filters?: any) {
    return this.tagsService.findAll(ensureTenant(user), filters);
  }

  @Get(':id')
  @Roles(Role.admin)
  findOne(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.tagsService.findOne(ensureTenant(user), id);
  }

  @Patch(':id')
  @Roles(Role.admin)
  update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTagDto: UpdateTagDto,
  ) {
    return this.tagsService.update(ensureTenant(user), id, updateTagDto);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.tagsService.remove(ensureTenant(user), id);
  }
}
