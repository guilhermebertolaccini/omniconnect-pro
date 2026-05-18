import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query params for GET /insight-ai/dashboard/summary.
 * Use `from` + `to` (ISO 8601) together, or omit both to use rolling `days` (default 30).
 */
export class DashboardSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Rolling window in days when from/to omitted', minimum: 1, maximum: 365 })
  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: 'Interval start (ISO 8601). Must be sent with `to`.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Interval end (ISO 8601). Must be sent with `from`.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filter analyses by segment id' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  })
  @IsInt()
  segment?: number;
}
