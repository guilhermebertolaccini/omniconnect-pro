import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { TabulateConversationDto } from './dto/tabulate-conversation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma.service';
import { getEmailDomain } from '../common/utils/email-domain.util';
import { ensureTenant } from '../common/utils/tenant-context';

@Controller('conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly prisma: PrismaService,
  ) { }

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  create(@CurrentUser() user: any, @Body() createConversationDto: CreateConversationDto) {
    console.log('📝 [POST /conversations] Criando conversa:', JSON.stringify(createConversationDto, null, 2));
    return this.conversationsService.create(ensureTenant(user), createConversationDto);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findAll(@Query() filters: any, @CurrentUser() user: any) {
    const tenantId = ensureTenant(user);
    const where: any = { ...filters };

    if (user.role === Role.operator && user.line) {
      where.userLine = user.line;
      where.userId = user.id;
    } else if (user.role === Role.supervisor && user.segment) {
      where.segment = user.segment;
    }

    return this.conversationsService.findAll(tenantId, where);
  }

  @Get('active')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  async getActiveConversations(@CurrentUser() user: any, @Query('days') days?: string) {
    const tenantId = ensureTenant(user);
    const daysToFilter = days ? parseInt(days) : 3;

    if (user.role === Role.admin || user.role === Role.digital) {
      const where: any = { tabulation: null };
      if (days) {
        const dateLimit = new Date(Date.now() - daysToFilter * 24 * 60 * 60 * 1000);
        where.datetime = { gte: dateLimit };
      }
      return this.conversationsService.findAll(tenantId, where);
    }

    if (user.role === Role.supervisor) {
      const userDomain = getEmailDomain(user.email);
      const dateLimit = new Date(Date.now() - daysToFilter * 24 * 60 * 60 * 1000);
      const where: any = {
        segment: user.segment,
        tabulation: null,
        datetime: { gte: dateLimit },
      };
      return this.conversationsService.findAllByEmailDomain(tenantId, where, userDomain);
    }

    if (user.segment) {
      const claimed = await this.conversationsService.claimPendingConversations(
        tenantId,
        user.id,
        user.segment,
        user.name,
        3,
      );
      if (claimed > 0) {
        console.log(`📥 Operador ${user.name} reclamou ${claimed} conversas pendentes`);
      }
    }

    return this.conversationsService.findActiveConversations(tenantId, undefined, user.id, daysToFilter, user.segment);
  }

  @Get('tabulated')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  async getTabulatedConversations(@CurrentUser() user: any, @Query('days') days?: string) {
    const tenantId = ensureTenant(user);
    const daysToFilter = days ? parseInt(days) : 3;

    if (user.role === Role.admin || user.role === Role.digital) {
      const where: any = { tabulation: { not: null } };
      if (days) {
        const dateLimit = new Date(Date.now() - daysToFilter * 24 * 60 * 60 * 1000);
        where.datetime = { gte: dateLimit };
      }
      return this.conversationsService.findAll(tenantId, where);
    }

    if (user.role === Role.supervisor) {
      const userDomain = getEmailDomain(user.email);
      const dateLimit = new Date(Date.now() - daysToFilter * 24 * 60 * 60 * 1000);
      const where: any = {
        segment: user.segment,
        tabulation: { not: null },
        datetime: { gte: dateLimit },
      };
      return this.conversationsService.findAllByEmailDomain(tenantId, where, userDomain);
    }

    return this.conversationsService.findTabulatedConversations(tenantId, undefined, user.id, daysToFilter);
  }

  @Get('segment/:segment')
  @Roles(Role.supervisor, Role.admin, Role.digital)
  getBySegment(
    @CurrentUser() user: any,
    @Param('segment') segment: string,
    @Query('tabulated') tabulated?: string,
  ) {
    return this.conversationsService.getConversationsBySegment(
      ensureTenant(user),
      +segment,
      tabulated === 'true',
    );
  }

  @Get('contact/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  getByContactPhone(
    @CurrentUser() user: any,
    @Param('phone') phone: string,
    @Query('tabulated') tabulated?: string,
  ) {
    const tenantId = ensureTenant(user);
    if (user?.role === Role.operator && user?.line) {
      return this.conversationsService.findByContactPhone(
        tenantId,
        phone,
        tabulated === 'true',
        user.line,
      );
    }
    return this.conversationsService.findByContactPhone(
      tenantId,
      phone,
      tabulated === 'true',
    );
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.conversationsService.findOne(ensureTenant(user), +id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() updateConversationDto: UpdateConversationDto) {
    return this.conversationsService.update(ensureTenant(user), +id, updateConversationDto);
  }

  @Post('tabulate/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  tabulate(
    @CurrentUser() user: any,
    @Param('phone') phone: string,
    @Body() tabulateDto: TabulateConversationDto,
  ) {
    return this.conversationsService.tabulateConversation(
      ensureTenant(user),
      phone,
      tabulateDto.tabulationId,
      tabulateDto.userLine,
    );
  }

  @Post('recall/:phone')
  @Roles(Role.operator)
  async recallContact(
    @Param('phone') phone: string,
    @CurrentUser() user: any,
  ) {
    const tenantId = ensureTenant(user);
    let userLine = user.line;

    if (!userLine) {
      const lineOperator = await this.prisma.lineOperator.findFirst({
        where: { userId: user.id },
        select: { lineId: true },
      });
      userLine = lineOperator?.lineId || null;
    }

    return this.conversationsService.recallContact(tenantId, phone, user.id, userLine);
  }

  @Post(':id/transfer')
  @Roles(Role.supervisor, Role.admin)
  @ApiOperation({ summary: 'Transferir conversa para outro operador' })
  async transferConversation(
    @Param('id') id: string,
    @Body() body: { targetOperatorId: number },
    @CurrentUser() user: any,
  ) {
    const tenantId = ensureTenant(user);
    const conversation = await this.conversationsService.findOne(tenantId, +id);
    if (!conversation) {
      throw new Error('Conversa não encontrada');
    }

    return this.conversationsService.transferConversation(
      tenantId,
      conversation.contactPhone,
      body.targetOperatorId,
      user,
    );
  }

  @Delete('contact/:phone')
  @Roles(Role.admin, Role.digital)
  @ApiOperation({ summary: 'Deletar todas as conversas de um contato (apenas admin e digital)' })
  async deleteConversationByPhone(
    @Param('phone') phone: string,
    @CurrentUser() user: any,
  ) {
    return this.conversationsService.deleteByContactPhone(ensureTenant(user), phone);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.conversationsService.remove(ensureTenant(user), +id);
  }
}
