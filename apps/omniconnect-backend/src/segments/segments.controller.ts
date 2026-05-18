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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { SegmentsService } from './segments.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';

@Controller('segments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  create(@CurrentUser() user: any, @Body() createSegmentDto: CreateSegmentDto) {
    return this.segmentsService.create(ensureTenant(user), createSegmentDto);
  }

  @Get()
  findAll(@CurrentUser() user: any, @Query('search') search?: string) {
    const tenantId = ensureTenant(user);
    if (user?.role === Role.supervisor && user?.segment) {
      return this.segmentsService.findAll(tenantId, search, user.segment);
    }
    return this.segmentsService.findAll(tenantId, search);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.segmentsService.findOne(ensureTenant(user), +id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateSegmentDto: UpdateSegmentDto,
  ) {
    return this.segmentsService.update(ensureTenant(user), +id, updateSegmentDto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.segmentsService.remove(ensureTenant(user), +id);
  }

  @Post('upload-csv')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCSV(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Arquivo CSV não fornecido');
    }
    const result = await this.segmentsService.importFromCSV(ensureTenant(user), file);
    return {
      message: `Importação concluída: ${result.success} segmento(s) criado(s)`,
      success: result.success,
      errors: result.errors,
    };
  }
}
