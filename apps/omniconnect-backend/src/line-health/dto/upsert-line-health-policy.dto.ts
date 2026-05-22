import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { LineHealthAction } from '@prisma/client';

export class UpsertLineHealthPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168) // 7 dias
  alertHoursMedium?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  alertHoursLow?: number;

  @IsOptional()
  @IsEnum(LineHealthAction)
  autoActionOnCritical?: LineHealthAction;

  @IsOptional()
  @IsEnum(LineHealthAction)
  autoActionOnHigh?: LineHealthAction;

  @IsOptional()
  @IsBoolean()
  suggestRotation?: boolean;
}
