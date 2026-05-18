import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) { }

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  create(@CurrentUser() user: any, @Body() createContactDto: CreateContactDto) {
    return this.contactsService.create(user.tenantId, createContactDto);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findAll(@CurrentUser() user: any, @Query('search') search?: string, @Query('segment') segment?: string) {
    return this.contactsService.findAll(user.tenantId, search, segment ? parseInt(segment) : undefined);
  }

  @Get('by-phone/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findByPhone(@CurrentUser() user: any, @Param('phone') phone: string) {
    return this.contactsService.findByPhone(user.tenantId, phone);
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.findOne(user.tenantId, +id);
  }

  @Patch('by-phone/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  updateByPhone(@CurrentUser() user: any, @Param('phone') phone: string, @Body() updateContactDto: UpdateContactDto) {
    return this.contactsService.updateByPhone(user.tenantId, phone, updateContactDto);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() updateContactDto: UpdateContactDto) {
    return this.contactsService.update(user.tenantId, +id, updateContactDto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.remove(user.tenantId, +id);
  }
}
