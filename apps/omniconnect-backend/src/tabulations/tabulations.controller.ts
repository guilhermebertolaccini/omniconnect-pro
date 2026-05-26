import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { TabulationsService } from './tabulations.service';
import { CreateTabulationDto } from './dto/create-tabulation.dto';
import { UpdateTabulationDto } from './dto/update-tabulation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { ensureTenant } from '../common/utils/tenant-context';

@Controller('tabulations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TabulationsController {
  constructor(private readonly tabulationsService: TabulationsService) { }

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  create(@Body() createTabulationDto: CreateTabulationDto, @CurrentUser() user: any) {
    return this.tabulationsService.create(createTabulationDto, ensureTenant(user));
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findAll(@CurrentUser() user: any, @Query('search') search?: string) {
    return this.tabulationsService.findAll(ensureTenant(user), search);
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tabulationsService.findOne(+id, ensureTenant(user));
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  update(
    @Param('id') id: string,
    @Body() updateTabulationDto: UpdateTabulationDto,
    @CurrentUser() user: any,
  ) {
    return this.tabulationsService.update(+id, updateTabulationDto, ensureTenant(user));
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tabulationsService.remove(+id, ensureTenant(user));
  }

  @Post('upload-csv')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCSV(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new Error('Arquivo CSV não fornecido');
    }

    const result = await this.tabulationsService.importFromCSV(file, ensureTenant(user));
    return {
      message: `Importação concluída: ${result.success} tabulação(ões) criada(s)`,
      success: result.success,
      errors: result.errors,
    };
  }
}
