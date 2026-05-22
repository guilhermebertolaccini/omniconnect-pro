import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SystemEventsService } from './system-events.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ensureTenant } from '../common/utils/tenant-context';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

class GetEventsQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return isNaN(num) ? 100 : num;
  })
  @IsNumber()
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  })
  @IsNumber()
  offset?: number;
}

class GetMetricsQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  groupBy?: 'type' | 'module' | 'severity' | 'hour' | 'day';
}

@Controller('system-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'supervisor')
export class SystemEventsController {
  constructor(private readonly systemEventsService: SystemEventsService) {}

  @Get()
  async getEvents(@CurrentUser() user: any, @Query() query: GetEventsQueryDto) {
    return this.systemEventsService.findEvents(ensureTenant(user), {
      type: query.type,
      module: query.module,
      userId: query.userId,
      severity: query.severity,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('metrics')
  async getMetrics(@CurrentUser() user: any, @Query() query: GetMetricsQueryDto) {
    return this.systemEventsService.getMetrics(ensureTenant(user), {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      groupBy: query.groupBy || 'type',
    });
  }

  @Get('events-per-minute')
  async getEventsPerMinute(@CurrentUser() user: any, @Query() query: GetMetricsQueryDto) {
    return this.systemEventsService.getEventsPerMinute(ensureTenant(user), {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  /**
   * Sprint Quick-wins — Q2 Guards audit.
   *
   * Listagem dedicada de eventos de guards (anti-fadiga + wallet + broker
   * + line-health). Mesma fonte que `GET /system-events`, mas pré-filtra
   * para os módulos relevantes — facilita o frontend `/settings/audit`
   * sem precisar conhecer o catálogo de `EventType`.
   */
  @Get('guards')
  @Roles('admin', 'supervisor', 'digital')
  async getGuardsAudit(
    @CurrentUser() user: any,
    @Query() query: GetEventsQueryDto,
  ) {
    return this.systemEventsService.findGuardsEvents(ensureTenant(user), {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
      offset: query.offset,
    });
  }
}

