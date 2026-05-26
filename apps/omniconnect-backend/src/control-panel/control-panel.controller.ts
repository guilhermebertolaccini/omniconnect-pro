import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ControlPanelService } from './control-panel.service';
import { UpdateControlPanelDto, AddBlockPhraseDto, RemoveBlockPhraseDto } from './dto/control-panel.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';
import { Role } from '@prisma/client';

@ApiTags('control-panel')
@ApiBearerAuth('JWT-auth')
@Controller('control-panel')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ControlPanelController {
  constructor(private readonly controlPanelService: ControlPanelService) { }

  // Buscar configurações (global ou por segmento)
  @Get()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  async findOne(@CurrentUser() user: any, @Query('segmentId') segmentId?: string) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.findOne(ensureTenant(user), segId);
  }

  // Atualizar configurações
  @Post()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  async upsert(@CurrentUser() user: any, @Body() dto: UpdateControlPanelDto) {
    return this.controlPanelService.upsert(ensureTenant(user), dto);
  }

  // Adicionar frase de bloqueio
  @Post('block-phrases')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  async addBlockPhrase(
    @CurrentUser() user: any,
    @Body() dto: AddBlockPhraseDto,
    @Query('segmentId') segmentId?: string,
  ) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.addBlockPhrase(ensureTenant(user), dto.phrase, segId);
  }

  // Remover frase de bloqueio
  @Delete('block-phrases')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  async removeBlockPhrase(
    @CurrentUser() user: any,
    @Body() dto: RemoveBlockPhraseDto,
    @Query('segmentId') segmentId?: string,
  ) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.removeBlockPhrase(ensureTenant(user), dto.phrase, segId);
  }

  // Verificar se pode contatar CPC
  @Get('check-cpc/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  async checkCPC(
    @CurrentUser() user: any,
    @Param('phone') phone: string,
    @Query('segmentId') segmentId?: string,
  ) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.canContactCPC(ensureTenant(user), phone, segId);
  }

  // Verificar se pode reenviar
  @Get('check-resend/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  async checkResend(
    @CurrentUser() user: any,
    @Param('phone') phone: string,
    @Query('segmentId') segmentId?: string,
  ) {
    const segId = segmentId ? parseInt(segmentId, 10) : undefined;
    return this.controlPanelService.canResend(ensureTenant(user), phone, segId);
  }

  // Marcar contato como CPC
  @Post('mark-cpc/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  async markAsCPC(
    @CurrentUser() user: any,
    @Param('phone') phone: string,
    @Body() body: { isCPC: boolean },
  ) {
    await this.controlPanelService.markAsCPC(ensureTenant(user), phone, body.isCPC);
    return { success: true };
  }

  // Atribuição em massa de linhas aos operadores
  @Post('assign-lines-mass')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  async assignLinesMass(@CurrentUser() user: any) {
    return this.controlPanelService.assignLinesToAllOperators(ensureTenant(user));
  }

  // Desatribuir todas as linhas dos operadores e alterar todas as linhas para segmento "Padrão"
  @Post('unassign-all-lines')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  async unassignAllLines(@CurrentUser() user: any) {
    return this.controlPanelService.unassignAllLines(ensureTenant(user));
  }
}
