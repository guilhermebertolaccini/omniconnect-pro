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
    const where: any = { ...filters };

    // Aplicar filtros baseados no papel do usuário
    if (user.role === Role.operator && user.line) {
      // Operador só vê conversas da sua linha E do seu userId específico
      where.userLine = user.line;
      where.userId = user.id; // Filtrar apenas conversas atribuídas a ele
    } else if (user.role === Role.supervisor && user.segment) {
      // Supervisor só vê conversas do seu segmento
      where.segment = user.segment;
    }
    // Admin e digital não têm filtro - veem todas as conversas

    return this.conversationsService.findAll(where);
  }

  @Get('active')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  async getActiveConversations(@CurrentUser() user: any, @Query('days') days?: string) {
    const daysToFilter = days ? parseInt(days) : 3; // Padrão: 3 dias
    console.log(`📋 [GET /conversations/active] Usuário: ${user.name} (${user.role}), line: ${user.line}, segment: ${user.segment}, days: ${daysToFilter}`);

    // Admin e Digital veem TODAS as conversas ativas sem restrição de domínio
    if (user.role === Role.admin || user.role === Role.digital) {
      const where: any = { tabulation: null };
      if (days) {
        const dateLimitMs = Date.now() - (daysToFilter * 24 * 60 * 60 * 1000);
        const dateLimit = new Date(dateLimitMs);
        where.datetime = { gte: dateLimit };
      }
      return this.conversationsService.findAll(where);
    }

    // Supervisor vê apenas conversas do seu segmento e mesmo domínio de email
    if (user.role === Role.supervisor) {
      const userDomain = getEmailDomain(user.email);
      const dateLimitMs = Date.now() - (daysToFilter * 24 * 60 * 60 * 1000);
      const dateLimit = new Date(dateLimitMs);
      const where: any = {
        segment: user.segment,
        tabulation: null,
        datetime: { gte: dateLimit }
      };

      // Buscar apenas conversas de operadores do mesmo domínio
      return this.conversationsService.findAllByEmailDomain(where, userDomain);
    }

    // Operador: primeiro reclamar um lote de conversas pendentes
    // Depois buscar todas as conversas dele (incluindo as recém-reclamadas)
    if (user.segment) {
      const claimed = await this.conversationsService.claimPendingConversations(
        user.id,
        user.segment,
        user.name,
        3 // Limite de conversas por lote
      );
      if (claimed > 0) {
        console.log(`📥 Operador ${user.name} reclamou ${claimed} conversas pendentes`);
      }
    }

    return this.conversationsService.findActiveConversations(undefined, user.id, daysToFilter, user.segment);
  }

  @Get('tabulated')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  async getTabulatedConversations(@CurrentUser() user: any, @Query('days') days?: string) {
    const daysToFilter = days ? parseInt(days) : 3; // Padrão: 3 dias
    console.log(`📋 [GET /conversations/tabulated] Usuário: ${user.name} (${user.role}), line: ${user.line}, segment: ${user.segment}, days: ${daysToFilter}`);

    // Admin e Digital veem TODAS as conversas tabuladas sem restrição de domínio
    if (user.role === Role.admin || user.role === Role.digital) {
      const where: any = { tabulation: { not: null } };
      if (days) {
        const dateLimitMs = Date.now() - (daysToFilter * 24 * 60 * 60 * 1000);
        const dateLimit = new Date(dateLimitMs);
        where.datetime = { gte: dateLimit };
      }
      return this.conversationsService.findAll(where);
    }

    // Supervisor vê apenas conversas tabuladas do seu segmento e mesmo domínio
    if (user.role === Role.supervisor) {
      const userDomain = getEmailDomain(user.email);
      const dateLimitMs = Date.now() - (daysToFilter * 24 * 60 * 60 * 1000);
      const dateLimit = new Date(dateLimitMs);
      const where: any = {
        segment: user.segment,
        tabulation: { not: null },
        datetime: { gte: dateLimit }
      };
      return this.conversationsService.findAllByEmailDomain(where, userDomain);
    }

    // Operador: buscar conversas tabuladas apenas por userId (não por userLine)
    // Isso permite que as conversas tabuladas continuem aparecendo mesmo se a linha foi banida
    return this.conversationsService.findTabulatedConversations(undefined, user.id, daysToFilter);
  }

  @Get('segment/:segment')
  @Roles(Role.supervisor, Role.admin, Role.digital)
  getBySegment(
    @Param('segment') segment: string,
    @Query('tabulated') tabulated?: string,
  ) {
    return this.conversationsService.getConversationsBySegment(
      +segment,
      tabulated === 'true',
    );
  }

  @Get('contact/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  getByContactPhone(
    @Param('phone') phone: string,
    @Query('tabulated') tabulated?: string,
    @CurrentUser() user?: any,
  ) {
    // Admin, digital e Supervisor podem ver qualquer contato
    // Operador só pode ver contatos da sua linha
    if (user?.role === Role.operator && user?.line) {
      // Verificar se o contato tem conversas na linha do operador
      return this.conversationsService.findByContactPhone(
        phone,
        tabulated === 'true',
        user.line, // Passar a linha como filtro adicional
      );
    }
    return this.conversationsService.findByContactPhone(
      phone,
      tabulated === 'true',
    );
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(+id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  update(@Param('id') id: string, @Body() updateConversationDto: UpdateConversationDto) {
    return this.conversationsService.update(+id, updateConversationDto);
  }

  @Post('tabulate/:phone')
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  tabulate(
    @Param('phone') phone: string,
    @Body() tabulateDto: TabulateConversationDto,
  ) {
    return this.conversationsService.tabulateConversation(phone, tabulateDto.tabulationId, tabulateDto.userLine);
  }

  @Post('recall/:phone')
  @Roles(Role.operator)
  async recallContact(
    @Param('phone') phone: string,
    @CurrentUser() user: any,
  ) {
    console.log(`📞 [POST /conversations/recall/:phone] Operador ${user.name} rechamando contato ${phone}`);

    // Buscar linha atual do operador (pode estar na tabela LineOperator ou no campo legacy)
    let userLine = user.line;

    // Se não tiver no campo legacy, buscar na tabela LineOperator
    if (!userLine) {
      const lineOperator = await (this.prisma as any).lineOperator.findFirst({
        where: { userId: user.id },
        select: { lineId: true },
      });
      userLine = lineOperator?.lineId || null;
    }

    return this.conversationsService.recallContact(phone, user.id, userLine);
  }

  @Post(':id/transfer')
  @Roles(Role.supervisor, Role.admin)
  @ApiOperation({ summary: 'Transferir conversa para outro operador' })
  async transferConversation(
    @Param('id') id: string,
    @Body() body: { targetOperatorId: number },
    @CurrentUser() user: any,
  ) {
    // Buscar a conversa para obter o contactPhone
    const conversation = await this.conversationsService.findOne(+id);
    if (!conversation) {
      throw new Error('Conversa não encontrada');
    }

    return this.conversationsService.transferConversation(
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
    console.log(`🗑️ [DELETE /conversations/contact/:phone] Usuário: ${user.name} (${user.role}) deletando conversas do contato ${phone}`);
    return this.conversationsService.deleteByContactPhone(phone);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  remove(@Param('id') id: string) {
    return this.conversationsService.remove(+id);
  }
}
