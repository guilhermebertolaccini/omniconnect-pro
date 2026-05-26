import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, UseInterceptors, UploadedFile, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  @Roles(Role.admin, Role.digital)
  create(@Body() createUserDto: CreateUserDto, @CurrentUser() currentUser: any) {
    // Digital só pode criar digital, supervisor, operator (não admin)
    if (currentUser.role === Role.digital) {
      const allowedRoles = ['digital', 'supervisor', 'operator'];
      if (!allowedRoles.includes(createUserDto.role)) {
        throw new ForbiddenException('Você não tem permissão para criar usuários com este perfil');
      }
    }
    return this.usersService.create(createUserDto, ensureTenant(currentUser));
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  findAll(@Query() filters: any, @CurrentUser() user: any) {
    return this.usersService.findAll(filters, ensureTenant(user));
  }

  @Get('online-operators')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  getOnlineOperators(@CurrentUser() user: any, @Query('segment') segment?: string) {
    return this.usersService.getOnlineOperators(
      ensureTenant(user),
      segment ? parseInt(segment) : undefined,
    );
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.findOne(+id, ensureTenant(user));
  }

  @Patch(':id')
  @Roles(Role.admin)
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    console.log('📝 Dados recebidos para atualizar usuário ID', id, ':', JSON.stringify(updateUserDto, null, 2));
    console.log('📝 Tipos dos campos:', {
      line: typeof updateUserDto.line,
      segment: typeof updateUserDto.segment,
      password: typeof updateUserDto.password,
      oneToOneActive: typeof updateUserDto.oneToOneActive,
      oneToOneActiveValue: updateUserDto.oneToOneActive,
    });

    try {
      const result = await this.usersService.update(+id, updateUserDto, ensureTenant(user));
      console.log('✅ Usuário atualizado com sucesso');
      return result;
    } catch (error) {
      console.error('❌ Erro ao atualizar usuário:', {
        message: error.message,
        response: error.response,
        stack: error.stack,
      });
      throw error;
    }
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.remove(+id, ensureTenant(user));
  }

  @Post('upload-csv')
  @Roles(Role.admin)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCSV(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new Error('Arquivo CSV não fornecido');
    }

    const result = await this.usersService.importFromCSV(file, ensureTenant(user));
    return {
      message: `Importação concluída: ${result.success} usuário(s) criado(s)`,
      success: result.success,
      errors: result.errors,
    };
  }
}
