import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { MessageBrokersService } from './message-brokers.service';
import { CreateMessageBrokerDto } from './dto/create-message-broker.dto';
import { UpdateMessageBrokerDto } from './dto/update-message-broker.dto';
import { ListMessageBrokersQueryDto } from './dto/list-message-brokers-query.dto';

@ApiTags('message-brokers')
@Controller('message-brokers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class MessageBrokersController {
  constructor(private readonly service: MessageBrokersService) {}

  @Get()
  @Roles(Role.admin, Role.supervisor)
  @ApiOperation({
    summary: 'Lista MessageBrokers do tenant atual (credenciais mascaradas).',
  })
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query() query: ListMessageBrokersQueryDto,
  ) {
    const tenantId = ensureTenant(user);
    return this.service.findAll(tenantId, query);
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor)
  @ApiOperation({ summary: 'Detalhe do MessageBroker (sem credenciais plaintext).' })
  findOne(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    const tenantId = ensureTenant(user);
    return this.service.findOne(tenantId, id);
  }

  @Post()
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Cria MessageBroker. Credenciais entram em plaintext e são cifradas antes de persistir.',
  })
  create(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: CreateMessageBrokerDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.create(tenantId, dto, actorId);
  }

  @Patch(':id')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Atualiza MessageBroker (parcial). Credenciais ausentes preservam; null/"" apagam.',
  })
  update(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Param('id') id: string,
    @Body() dto: UpdateMessageBrokerDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.update(tenantId, id, dto, actorId);
  }

  @Delete(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Remove MessageBroker (cascata SET NULL em quem usa como fallback).' })
  remove(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Param('id') id: string,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.remove(tenantId, id, actorId);
  }

  @Post(':id/test')
  @Roles(Role.admin, Role.supervisor)
  @ApiOperation({
    summary:
      'Smoke test do broker: confirma decrypt da apiKey. Não envia mensagem real ' +
      '(sinks por canal entrarão na Sprint Régua-Engine).',
  })
  testBroker(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Param('id') id: string,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.testBroker(tenantId, id, actorId);
  }
}
