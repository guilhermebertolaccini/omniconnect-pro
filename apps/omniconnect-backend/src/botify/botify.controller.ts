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
import { BotifyService } from './botify.service';
import { BotifyConversationsService } from './botify-conversations.service';
import { BotifyFlowEngineService } from './botify-flow-engine.service';
import { ResolveBotifyConversationDto } from './dto/resolve-botify-conversation.dto';
import { AppendBotifyMessageDto } from './dto/append-botify-message.dto';
import { SendBotifyConversationDto } from './dto/send-botify-conversation.dto';
import { UpdateBotifyChannelDto } from './dto/update-botify-channel.dto';
import { CreateBotifyBotDto } from './dto/create-bot.dto';
import { UpdateBotifyBotDto } from './dto/update-bot.dto';
import { CreateBotifyFlowDto } from './dto/create-flow.dto';
import { UpdateBotifyFlowDto } from './dto/update-flow.dto';
import { ImportWordpressSnapshotDto } from './dto/import-wordpress-snapshot.dto';
import { SimulateBotifyFlowDto } from './dto/simulate-botify-flow.dto';

function parseOptionalInt(v?: string): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

const BOTIFY_ROLES = [
  Role.admin,
  Role.supervisor,
  Role.digital,
  Role.operator,
] as const;

@ApiTags('botify')
@ApiBearerAuth('JWT-auth')
@Controller('botify')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BotifyController {
  constructor(
    private readonly botify: BotifyService,
    private readonly conversations: BotifyConversationsService,
    private readonly engine: BotifyFlowEngineService,
  ) {}

  // --- Bots ---
  @Get('bots')
  @Roles(...BOTIFY_ROLES)
  @ApiOperation({ summary: 'Listar bots (paginado)' })
  listBots(
    @CurrentUser() user: RequestUserLike,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.botify.listBots(
      ensureTenant(user),
      parseOptionalInt(page),
      parseOptionalInt(limit),
    );
  }

  @Get('bots/:id')
  @Roles(...BOTIFY_ROLES)
  getBot(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.botify.getBot(ensureTenant(user), id);
  }

  @Post('bots')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  createBot(@CurrentUser() user: RequestUserLike, @Body() dto: CreateBotifyBotDto) {
    return this.botify.createBot(ensureTenant(user), dto);
  }

  @Patch('bots/:id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  updateBot(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateBotifyBotDto,
  ) {
    return this.botify.updateBot(ensureTenant(user), id, dto);
  }

  @Delete('bots/:id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  deleteBot(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.botify.deleteBot(ensureTenant(user), id);
  }

  @Get('bots/:id/channel')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({ summary: 'Config WhatsApp Cloud do bot (G7-D)' })
  getBotChannel(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.conversations.getBotChannel(ensureTenant(user), id);
  }

  @Patch('bots/:id/channel')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  updateBotChannel(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateBotifyChannelDto,
  ) {
    return this.conversations.updateBotChannel(ensureTenant(user), id, dto);
  }

  // --- Flows ---
  @Get('flows')
  @Roles(...BOTIFY_ROLES)
  listFlows(
    @CurrentUser() user: RequestUserLike,
    @Query('botId') botId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.botify.listFlows(
      ensureTenant(user),
      botId,
      parseOptionalInt(page),
      parseOptionalInt(limit),
    );
  }

  @Post('import/wordpress')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({ summary: 'Import idempotente snapshot WordPress → Omni (G6)' })
  importWp(
    @CurrentUser() user: RequestUserLike,
    @Body() dto: ImportWordpressSnapshotDto,
  ) {
    return this.botify.importWordpressSnapshot(ensureTenant(user), dto);
  }

  @Get('flows/:id')
  @Roles(...BOTIFY_ROLES)
  getFlow(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.botify.getFlow(ensureTenant(user), id);
  }

  @Post('flows')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  createFlow(@CurrentUser() user: RequestUserLike, @Body() dto: CreateBotifyFlowDto) {
    return this.botify.createFlow(ensureTenant(user), dto);
  }

  @Patch('flows/:id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  updateFlow(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateBotifyFlowDto,
  ) {
    return this.botify.updateFlow(ensureTenant(user), id, dto);
  }

  @Delete('flows/:id')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  deleteFlow(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.botify.deleteFlow(ensureTenant(user), id);
  }

  @Post('flows/:id/publish')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  publishFlow(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.botify.publishFlow(ensureTenant(user), id);
  }

  @Post('flows/:id/unpublish')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  unpublishFlow(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.botify.unpublishFlow(ensureTenant(user), id);
  }

  @Post('runtime/simulate')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary: 'Simular percorrimento do fluxo (dry-run; sem handoff real)',
  })
  simulate(
    @CurrentUser() user: RequestUserLike,
    @Body() dto: SimulateBotifyFlowDto,
  ) {
    return this.engine.run(ensureTenant(user), dto.flowId, dto.text, {
      dryRun: true,
    });
  }

  // --- Conversations (G7-C) ---
  @Get('conversations')
  @Roles(...BOTIFY_ROLES)
  @ApiOperation({ summary: 'Listar conversas Botify do tenant' })
  listConversations(
    @CurrentUser() user: RequestUserLike,
    @Query('botId') botId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.listConversations(
      ensureTenant(user),
      botId,
      parseOptionalInt(page),
      parseOptionalInt(limit),
    );
  }

  @Post('conversations/resolve')
  @Roles(...BOTIFY_ROLES)
  resolveConversation(
    @CurrentUser() user: RequestUserLike,
    @Body() dto: ResolveBotifyConversationDto,
  ) {
    return this.conversations.resolveConversation(ensureTenant(user), dto);
  }

  @Get('conversations/:conversationId/messages')
  @Roles(...BOTIFY_ROLES)
  listConversationMessages(
    @CurrentUser() user: RequestUserLike,
    @Param('conversationId') conversationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.listMessages(
      ensureTenant(user),
      conversationId,
      parseOptionalInt(page),
      parseOptionalInt(limit),
    );
  }

  @Post('conversations/:conversationId/messages')
  @Roles(...BOTIFY_ROLES)
  appendConversationMessage(
    @CurrentUser() user: RequestUserLike,
    @Param('conversationId') conversationId: string,
    @Body() dto: AppendBotifyMessageDto,
  ) {
    return this.conversations.appendMessage(
      ensureTenant(user),
      conversationId,
      dto,
    );
  }

  @Post('conversations/:conversationId/send')
  @Roles(...BOTIFY_ROLES)
  sendConversationMessage(
    @CurrentUser() user: RequestUserLike,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendBotifyConversationDto,
  ) {
    return this.conversations.sendConversationMessage(
      ensureTenant(user),
      conversationId,
      dto.content,
    );
  }
}
