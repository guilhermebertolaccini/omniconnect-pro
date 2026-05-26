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
  Res,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SendTemplateDto, SendTemplateMassiveDto } from './dto/send-template.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';

@Controller('templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) { }

  /**
   * CRUD de Templates
   */

  @Post()
  @Roles('admin', 'supervisor', 'digital')
  create(@Body() createTemplateDto: CreateTemplateDto, @CurrentUser() user: any) {
    return this.templatesService.create(createTemplateDto, ensureTenant(user));
  }

  @Get()
  @Roles('admin', 'supervisor', 'operator', 'digital')
  findAll(@CurrentUser() user: any, @Query() filters?: any) {
    return this.templatesService.findAll(ensureTenant(user), filters);
  }

  @Get(':id')
  @Roles('admin', 'supervisor', 'operator', 'digital')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.templatesService.findOne(id, ensureTenant(user));
  }

  @Get('segment/:segmentId')
  @Roles('admin', 'supervisor', 'operator', 'digital')
  findBySegment(
    @Param('segmentId', ParseIntPipe) segmentId: number,
    @CurrentUser() user: any,
  ) {
    return this.templatesService.findBySegment(segmentId, ensureTenant(user));
  }

  // Buscar templates por linha (retorna templates do segmento da linha + globais)
  @Get('line/:lineId')
  @Roles('admin', 'supervisor', 'operator', 'digital')
  findByLine(
    @Param('lineId', ParseIntPipe) lineId: number,
    @CurrentUser() user: any,
  ) {
    return this.templatesService.findByLineAndSegment(lineId, ensureTenant(user));
  }

  @Patch(':id')
  @Roles('admin', 'supervisor', 'digital')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @CurrentUser() user: any,
  ) {
    return this.templatesService.update(id, updateTemplateDto, ensureTenant(user));
  }

  @Delete(':id')
  @Roles('admin', 'supervisor', 'digital')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.templatesService.remove(id, ensureTenant(user));
  }

  /**
   * Sincronização com WhatsApp Cloud API
   */

  @Post(':id/sync')
  @Roles('admin')
  syncWithCloudApi(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.templatesService.syncWithCloudApi(id, ensureTenant(user));
  }

  /**
   * Envio de Templates (1x1)
   */

  @Post('send')
  @Roles('admin', 'supervisor', 'operator', 'digital')
  sendTemplate(@Body() sendTemplateDto: SendTemplateDto, @CurrentUser() user: any) {
    return this.templatesService.sendTemplate(sendTemplateDto, user, ensureTenant(user));
  }

  /**
   * Envio de Templates (Massivo)
   */

  @Post('send/massive')
  @Roles('admin', 'supervisor', 'digital')
  sendTemplateMassive(
    @Body() sendTemplateMassiveDto: SendTemplateMassiveDto,
    @CurrentUser() user: any,
  ) {
    return this.templatesService.sendTemplateMassive(sendTemplateMassiveDto, user, ensureTenant(user));
  }

  /**
   * Histórico e Estatísticas
   */

  @Get(':id/history')
  @Roles('admin', 'supervisor', 'digital')
  getHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Query() filters?: any,
  ) {
    return this.templatesService.getTemplateHistory(id, ensureTenant(user), filters);
  }

  @Get(':id/stats')
  @Roles('admin', 'supervisor', 'digital')
  getStats(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.templatesService.getTemplateStats(id, ensureTenant(user));
  }

  /**
   * Exportação de Templates em CSV
   */
  @Get('export/csv')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="templates.csv"')
  async exportToCsv(
    @CurrentUser() user: any,
    @Query() filters?: any,
    @Res() res?: Response,
  ) {
    const csv = await this.templatesService.exportToCsv(ensureTenant(user), filters);

    // Adicionar BOM (Byte Order Mark) para UTF-8 para garantir encoding correto no Excel
    const csvWithBom = '﻿' + csv;

    if (res) {
      res.send(csvWithBom);
    } else {
      return csvWithBom;
    }
  }
}
