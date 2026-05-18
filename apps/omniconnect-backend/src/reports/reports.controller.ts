import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('op-sintetico')
  @Roles('admin', 'supervisor')
  async getOpSinteticoReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getOpSinteticoReport(ensureTenant(user), filters);
  }

  @Get('kpi')
  @Roles('admin', 'supervisor')
  async getKpiReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getKpiReport(ensureTenant(user), filters);
  }

  @Get('hsm')
  @Roles('admin', 'supervisor')
  async getHsmReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getHsmReport(ensureTenant(user), filters);
  }

  @Get('line-status')
  @Roles('admin', 'supervisor')
  async getLineStatusReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getLineStatusReport(ensureTenant(user), filters);
  }

  @Get('envios')
  @Roles('admin', 'supervisor')
  async getEnviosReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getEnviosReport(ensureTenant(user), filters);
  }

  @Get('indicadores')
  @Roles('admin', 'supervisor')
  async getIndicadoresReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getIndicadoresReport(ensureTenant(user), filters);
  }

  @Get('tempos')
  @Roles('admin', 'supervisor')
  async getTemposReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getTemposReport(ensureTenant(user), filters);
  }

  @Get('templates')
  @Roles('admin', 'supervisor')
  async getTemplatesReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getTemplatesReport(ensureTenant(user), filters);
  }

  @Get('completo-csv')
  @Roles('admin', 'supervisor')
  async getCompletoCsvReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getCompletoCsvReport(ensureTenant(user), filters);
  }

  @Get('equipe')
  @Roles('admin', 'supervisor')
  async getEquipeReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getEquipeReport(ensureTenant(user), filters);
  }

  @Get('dados-transacionados')
  @Roles('admin', 'supervisor')
  async getDadosTransacionadosReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getDadosTransacionadosReport(ensureTenant(user), filters);
  }

  @Get('detalhado-conversas')
  @Roles('admin', 'supervisor')
  async getDetalhadoConversasReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getDetalhadoConversasReport(ensureTenant(user), filters);
  }

  @Get('linhas')
  @Roles('admin', 'supervisor')
  async getLinhasReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getLinhasReport(ensureTenant(user), filters);
  }

  @Get('resumo-atendimentos')
  @Roles('admin', 'supervisor')
  async getResumoAtendimentosReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getResumoAtendimentosReport(ensureTenant(user), filters);
  }

  @Get('usuarios')
  @Roles('admin', 'supervisor')
  async getUsuariosReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getUsuariosReport(ensureTenant(user), filters);
  }

  @Get('hiper-personalizado')
  @Roles('admin', 'supervisor')
  async getHiperPersonalizadoReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    return this.reportsService.getHiperPersonalizadoReport(ensureTenant(user), filters);
  }

  @Get('consolidado')
  @Roles('admin', 'supervisor')
  async getConsolidatedReport(@CurrentUser() user: any, @Query() filters: ReportFilterDto) {
    const tenantId = ensureTenant(user);
    const [
      opSintetico,
      kpi,
      hsm,
      lineStatus,
      envios,
      indicadores,
      tempos,
      templates,
      completoCsv,
      equipe,
      dadosTransacionados,
      detalhadoConversas,
      linhas,
      resumoAtendimentos,
      usuarios,
      hiperPersonalizado,
    ] = await Promise.all([
      this.reportsService.getOpSinteticoReport(tenantId, filters),
      this.reportsService.getKpiReport(tenantId, filters),
      this.reportsService.getHsmReport(tenantId, filters),
      this.reportsService.getLineStatusReport(tenantId, filters),
      this.reportsService.getEnviosReport(tenantId, filters),
      this.reportsService.getIndicadoresReport(tenantId, filters),
      this.reportsService.getTemposReport(tenantId, filters),
      this.reportsService.getTemplatesReport(tenantId, filters),
      this.reportsService.getCompletoCsvReport(tenantId, filters),
      this.reportsService.getEquipeReport(tenantId, filters),
      this.reportsService.getDadosTransacionadosReport(tenantId, filters),
      this.reportsService.getDetalhadoConversasReport(tenantId, filters),
      this.reportsService.getLinhasReport(tenantId, filters),
      this.reportsService.getResumoAtendimentosReport(tenantId, filters),
      this.reportsService.getUsuariosReport(tenantId, filters),
      this.reportsService.getHiperPersonalizadoReport(tenantId, filters),
    ]);

    return {
      periodo: {
        inicio: filters.startDate || 'Início',
        fim: filters.endDate || 'Atual',
      },
      segmento: filters.segment || 'Todos',
      relatorios: {
        opSintetico,
        kpi,
        hsm,
        lineStatus,
        envios,
        indicadores,
        tempos,
        templates,
        completoCsv,
        equipe,
        dadosTransacionados,
        detalhadoConversas,
        linhas,
        resumoAtendimentos,
        usuarios,
        hiperPersonalizado,
      },
    };
  }
}
