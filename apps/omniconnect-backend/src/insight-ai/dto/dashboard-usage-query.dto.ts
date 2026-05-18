import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class DashboardUsageQueryDto {
  @ApiPropertyOptional({ description: 'Rolling window when from/to omitted', minimum: 1, maximum: 365 })
  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['success', 'failed', 'all'],
    default: 'success',
    description: 'Filter AIUsageLog rows; default success (typical cost view)',
  })
  @IsOptional()
  @IsIn(['success', 'failed', 'all'])
  status?: 'success' | 'failed' | 'all';

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  })
  @IsInt()
  @Min(0)
  offset?: number;
}
