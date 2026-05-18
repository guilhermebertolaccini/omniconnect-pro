import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { LinesService } from './lines.service';
import { CreateLineDto } from './dto/create-line.dto';
import { UpdateLineDto } from './dto/update-line.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';

@Controller('lines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LinesController {
  constructor(private readonly linesService: LinesService) { }

  @Post()
  @Roles(Role.admin, Role.ativador)
  create(@Body() createLineDto: CreateLineDto, @CurrentUser() user: any) {
    return this.linesService.create(ensureTenant(user), createLineDto, user.id);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.ativador)
  findAll(@CurrentUser() user: any, @Query() filters: any) {
    return this.linesService.findAll(ensureTenant(user), filters);
  }

  @Get('schema')
  @Roles(Role.admin)
  getSchema() {
    return {
      message: 'Estrutura esperada para criar uma linha (WhatsApp Cloud API)',
      required: {
        phone: 'string (obrigatório) - Ex: "5511999999999"',
        appId: 'number (obrigatório) - ID do App (credenciais vêm do App)',
        numberId: 'string (obrigatório) - Phone Number ID do WhatsApp Cloud API',
      },
      optional: {
        segment: 'number (opcional) - ID do segmento',
        lineStatus: 'string (opcional) - "active" ou "ban"',
        receiveMedia: 'boolean (opcional) - Se true, baixa mídia automaticamente',
      },
      note: 'As credenciais (Access Token, App Secret, Webhook Verify Token) são configuradas no App. Crie um App primeiro antes de criar linhas.',
      example: {
        phone: '5511999999999',
        appId: 1,
        numberId: '123456789012345',
        segment: 1,
        receiveMedia: false,
      },
    };
  }

  @Get('available/:segment')
  @Roles(Role.admin)
  getAvailable(@CurrentUser() user: any, @Param('segment') segment: string) {
    return this.linesService.getAvailableLines(ensureTenant(user), +segment);
  }

  @Get('segment/:segmentId')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  getBySegment(
    @Param('segmentId') segmentId: string,
    @CurrentUser() user: any,
  ) {
    if (user.role === Role.operator && user.segment !== +segmentId) {
      throw new Error('Você só pode acessar linhas do seu segmento');
    }
    return this.linesService.getAvailableLinesForSegment(ensureTenant(user), +segmentId);
  }

  @Get('activators-productivity')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  getActivatorsProductivity(@CurrentUser() user: any) {
    return this.linesService.getActivatorsProductivity(ensureTenant(user));
  }

  @Get('allocation-stats')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  getAllocationStats(@CurrentUser() user: any) {
    return this.linesService.getLinesAllocationStats(ensureTenant(user));
  }

  @Get(':id')
  @Roles(Role.admin, Role.ativador)
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.linesService.findOne(ensureTenant(user), +id);
  }

  @Get(':id/test-connection')
  @Roles(Role.admin, Role.ativador)
  testConnection(@CurrentUser() user: any, @Param('id') id: string) {
    return this.linesService.testConnection(ensureTenant(user), +id);
  }

  @Patch(':id')
  @Roles(Role.admin)
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() updateLineDto: UpdateLineDto) {
    return this.linesService.update(ensureTenant(user), +id, updateLineDto);
  }

  @Post(':id/ban')
  @Roles(Role.admin)
  handleBan(@CurrentUser() user: any, @Param('id') id: string) {
    return this.linesService.handleBannedLine(ensureTenant(user), +id);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.linesService.remove(ensureTenant(user), +id);
  }
}
