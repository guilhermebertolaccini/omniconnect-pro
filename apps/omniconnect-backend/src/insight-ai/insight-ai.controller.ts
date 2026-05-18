import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalyzeConversationDto } from './dto/analyze-conversation.dto';
import { InsightAiService } from './insight-ai.service';

@ApiTags('Insight AI')
@ApiBearerAuth()
@Controller('insight-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsightAiController {
  constructor(private readonly insightAiService: InsightAiService) {}

  @Post('analyze/:phone')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({ summary: 'Analisa as conversas de um lead pelo telefone e persiste o resultado' })
  analyzeByPhone(@Param('phone') phone: string, @Body() dto: AnalyzeConversationDto, @CurrentUser() user: any) {
    return this.insightAiService.analyzeByPhone(user.tenantId, phone, { ...dto, contactPhone: phone });
  }

  @Post('analyze')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({ summary: 'Analisa conversas recentes em lote para gerar métricas de IA' })
  analyzeMany(@Body() dto: AnalyzeConversationDto, @CurrentUser() user: any) {
    if (dto.contactPhone) return this.insightAiService.analyzeByPhone(user.tenantId, dto.contactPhone, dto);
    return this.insightAiService.analyzeManyPending(user.tenantId, dto);
  }

  @Get('analyses')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  listAnalyses(@Query('contactPhone') contactPhone?: string, @Query('limit') limit?: string, @CurrentUser() user?: any) {
    return this.insightAiService.listAnalyses(user.tenantId, { contactPhone, limit: limit ? Number(limit) : undefined });
  }

  @Get('dashboard/summary')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  getExecutiveSummary(@Query('days') days?: string, @CurrentUser() user?: any) {
    return this.insightAiService.getExecutiveSummary(user.tenantId, days ? Number(days) : 30);
  }
}
