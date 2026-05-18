import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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
  analyzeByPhone(@Param('phone') phone: string, @Body() dto: AnalyzeConversationDto) {
    return this.insightAiService.analyzeByPhone(phone, { ...dto, contactPhone: phone });
  }

  @Post('analyze')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({ summary: 'Analisa conversas recentes em lote para gerar métricas de IA' })
  analyzeMany(@Body() dto: AnalyzeConversationDto) {
    if (dto.contactPhone) return this.insightAiService.analyzeByPhone(dto.contactPhone, dto);
    return this.insightAiService.analyzeManyPending(dto);
  }

  @Get('analyses')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  listAnalyses(@Query('contactPhone') contactPhone?: string, @Query('limit') limit?: string) {
    return this.insightAiService.listAnalyses({ contactPhone, limit: limit ? Number(limit) : undefined });
  }

  @Get('dashboard/summary')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  getExecutiveSummary(@Query('days') days?: string) {
    return this.insightAiService.getExecutiveSummary(days ? Number(days) : 30);
  }
}
