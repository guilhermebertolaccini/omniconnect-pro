import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { AntiFatigueAppliesTo } from '@prisma/client';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Upsert da regra de anti-fadiga do tenant. Todos os campos opcionais
 * — backend preenche defaults na primeira chamada (idempotente).
 *
 * `businessHoursStart`/`End`: par opcional (ambos ou nenhum). Strings
 * `HH:MM` em UTC (per-tenant TZ é trabalho futuro).
 */
export class UpsertAntiFatigueRuleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720) // 30 dias
  windowHours?: number;

  @IsOptional()
  @IsEnum(AntiFatigueAppliesTo)
  appliesTo?: AntiFatigueAppliesTo;

  @IsOptional()
  @IsBoolean()
  allowBypassForUrgent?: boolean;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'businessHoursStart must be HH:MM' })
  businessHoursStart?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'businessHoursEnd must be HH:MM' })
  businessHoursEnd?: string | null;
}
