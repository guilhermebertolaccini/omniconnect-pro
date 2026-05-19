import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BotifyService } from './botify.service';
import { BotifyConversationsService } from './botify-conversations.service';
import { BotifyRoutingService } from './botify-routing.service';
import { BotifyInternalGuard } from './guards/botify-internal.guard';
import type { BotifyInternalRequest } from './guards/botify-internal.guard';
import { ResolveBotifyConversationDto } from './dto/resolve-botify-conversation.dto';
import { AppendBotifyMessageDto } from './dto/append-botify-message.dto';
import { SendBotifyConversationDto } from './dto/send-botify-conversation.dto';

function parseOptionalInt(v?: string): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

@ApiTags('botify-internal')
@Controller('botify/internal')
export class BotifyInternalController {
  constructor(
    private readonly botify: BotifyService,
    private readonly conversations: BotifyConversationsService,
    private readonly routing: BotifyRoutingService,
  ) {}

  @Get('routing/meta/:accountId')
  @UseGuards(BotifyInternalGuard)
  @ApiOperation({ summary: 'Resolver bot/flow por conta Meta WABA (webhook)' })
  resolveMetaRouting(
    @Req() req: BotifyInternalRequest,
    @Param('accountId') accountId: string,
  ) {
    return this.routing.resolveMetaAccount(req.botifyInternalTenantId!, accountId);
  }

  @Get('routing/evolution/:instance')
  @UseGuards(BotifyInternalGuard)
  @ApiOperation({ summary: 'Resolver bot/flow por instância Evolution (webhook)' })
  async resolveEvolutionRouting(
    @Req() req: BotifyInternalRequest,
    @Param('instance') instance: string,
    @Query('apiKey') apiKey?: string,
  ) {
    const tenantId = req.botifyInternalTenantId!;
    if (apiKey?.trim()) {
      const valid = await this.routing.validateEvolutionApiKey(
        tenantId,
        instance,
        apiKey,
      );
      if (!valid) {
        throw new UnauthorizedException('Invalid Evolution API key');
      }
    }
    return this.routing.resolveEvolutionInstance(tenantId, instance);
  }

  @Get('flows/:flowId/runtime-config')
  @UseGuards(BotifyInternalGuard)
  @ApiOperation({
    summary:
      'Config runtime do fluxo para o microserviço (Bearer BOTIFY_INTERNAL_SYNC_SECRET + X-Omni-Tenant-Id)',
  })
  getRuntimeConfig(
    @Param('flowId') flowId: string,
    @Req() req: BotifyInternalRequest,
  ) {
    const tenantId = req.botifyInternalTenantId!;
    return this.botify.getRuntimeFlowConfig(tenantId, flowId);
  }

  @Post('conversations/resolve')
  @UseGuards(BotifyInternalGuard)
  @ApiOperation({ summary: 'Resolver/criar conversa Botify (microserviço)' })
  resolveConversation(
    @Req() req: BotifyInternalRequest,
    @Body() dto: ResolveBotifyConversationDto,
  ) {
    return this.conversations.resolveConversation(req.botifyInternalTenantId!, dto);
  }

  @Get('conversations/:conversationId/messages')
  @UseGuards(BotifyInternalGuard)
  @ApiOperation({ summary: 'Listar mensagens (runtime / IA)' })
  listMessages(
    @Req() req: BotifyInternalRequest,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.botifyInternalTenantId!;
    const lim = parseOptionalInt(limit) ?? 40;
    return this.conversations.listMessagesForRuntime(tenantId, conversationId, lim);
  }

  @Post('conversations/:conversationId/messages')
  @UseGuards(BotifyInternalGuard)
  appendMessage(
    @Req() req: BotifyInternalRequest,
    @Param('conversationId') conversationId: string,
    @Body() dto: AppendBotifyMessageDto,
  ) {
    return this.conversations.appendMessage(
      req.botifyInternalTenantId!,
      conversationId,
      dto,
    );
  }

  @Post('conversations/:conversationId/send')
  @UseGuards(BotifyInternalGuard)
  sendMessage(
    @Req() req: BotifyInternalRequest,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendBotifyConversationDto,
  ) {
    return this.conversations.sendConversationMessage(
      req.botifyInternalTenantId!,
      conversationId,
      dto.content,
    );
  }
}
