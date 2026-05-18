import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppsService } from './apps.service';
import { CreateAppDto } from './dto/create-app.dto';
import { UpdateAppDto } from './dto/update-app.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('apps')
@ApiBearerAuth()
@Controller('apps')
@UseGuards(JwtAuthGuard)
export class AppsController {
  constructor(private readonly appsService: AppsService) {}

  @Post()
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Criar um novo app' })
  @ApiResponse({ status: 201, description: 'App criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou app já existe' })
  create(@CurrentUser() user: any, @Body() createAppDto: CreateAppDto) {
    return this.appsService.create(user.tenantId, createAppDto);
  }

  @Get()
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Listar todos os apps' })
  @ApiResponse({ status: 200, description: 'Lista de apps' })
  findAll(@CurrentUser() user: any) {
    return this.appsService.findAll(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Buscar um app por ID' })
  @ApiResponse({ status: 200, description: 'App encontrado' })
  @ApiResponse({ status: 404, description: 'App não encontrado' })
  findOne(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.appsService.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Atualizar um app' })
  @ApiResponse({ status: 200, description: 'App atualizado com sucesso' })
  @ApiResponse({ status: 404, description: 'App não encontrado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  update(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() updateAppDto: UpdateAppDto) {
    return this.appsService.update(user.tenantId, id, updateAppDto);
  }

  @Delete(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Excluir um app' })
  @ApiResponse({ status: 200, description: 'App excluído com sucesso' })
  @ApiResponse({ status: 404, description: 'App não encontrado' })
  @ApiResponse({ status: 400, description: 'App está sendo usado por linhas' })
  remove(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.appsService.remove(user.tenantId, id);
  }
}

