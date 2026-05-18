import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalyzeConversationDto } from './dto/analyze-conversation.dto';
import { DashboardSummaryQueryDto } from './dto/dashboard-summary-query.dto';
import { DashboardUsageQueryDto } from './dto/dashboard-usage-query.dto';
import { ListAnalysesQueryDto } from './dto/list-analyses-query.dto';
import { InsightAiService } from './insight-ai.service';

@ApiTags('Insight AI')
@ApiBearerAuth()
@Controller('insight-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsightAiController {
  constructor(private readonly insightAiService: InsightAiService) {}

  @Post('analyze/:phone')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary:
      'Analisa as conversas de um lead pelo telefone. Por padrão, enfileira um job BullMQ; passar ?sync=true para execução síncrona (uso administrativo).',
  })
  @ApiQuery({ name: 'sync', required: false, type: Boolean })
  analyzeByPhone(
    @Param('phone') phone: string,
    @Body() dto: AnalyzeConversationDto,
    @CurrentUser() user: any,
    @Query('sync') sync?: string,
  ) {
    const isSync = sync === 'true' || sync === '1';
    if (isSync) {
      return this.insightAiService.analyzeByPhone(user.tenantId, phone, { ...dto, contactPhone: phone });
    }
    return this.insightAiService.enqueueAnalyzeByPhone(user.tenantId, phone, { ...dto, contactPhone: phone });
  }

  @Post('analyze')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary:
      'Analisa conversas recentes em lote. Modo administrativo, executa sincrono. Para por-conversa, use POST /insight-ai/analyze/:phone (assíncrono).',
  })
  analyzeMany(@Body() dto: AnalyzeConversationDto, @CurrentUser() user: any) {
    if (dto.contactPhone) return this.insightAiService.analyzeByPhone(user.tenantId, dto.contactPhone, dto);
    return this.insightAiService.analyzeManyPending(user.tenantId, dto);
  }

  @Get('jobs/:jobId')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({ summary: 'Status de um job de análise enfileirado' })
  getJobStatus(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.insightAiService.getJobStatus(user.tenantId, jobId);
  }

  @Get('analyses')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary: 'Lista análises InsightAI do tenant (paginado)',
    description:
      'Opcionalmente filtre por intervalo com `from` e `to` (ISO 8601, ambos obrigatórios juntos), segmento e telefone.',
  })
  listAnalyses(@Query() query: ListAnalysesQueryDto, @CurrentUser() user: any) {
    return this.insightAiService.listAnalyses(user.tenantId, query);
  }

  @Get('dashboard/summary')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary: 'Resumo executivo agregado (métricas InsightAI)',
    description:
      'Use `from`+`to` ou, se omitidos, janela móvel de `days` (default 30). Até 2000 análises mais recentes no período entram na agregação (`sampleCap`).',
  })
  getExecutiveSummary(@Query() query: DashboardSummaryQueryDto, @CurrentUser() user: any) {
    return this.insightAiService.getExecutiveSummary(user.tenantId, query);
  }

  @Get('dashboard/usage')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary: 'Uso e custo estimado (AIUsageLog) por provedor + linhas paginadas',
    description:
      '`status` default `success`. Use `all` para incl falhas. Escopo sempre do tenant autenticado.',
  })
  getDashboardUsage(@Query() query: DashboardUsageQueryDto, @CurrentUser() user: any) {
    return this.insightAiService.getDashboardUsage(user.tenantId, query);
  }
}
