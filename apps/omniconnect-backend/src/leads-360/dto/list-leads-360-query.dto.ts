import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export enum LeadTemperatureFilter {
  hot = 'hot',
  warm = 'warm',
  cold = 'cold',
  unknown = 'unknown',
}

export enum LeadCrmFilter {
  matched = 'matched',
  unmatched = 'unmatched',
  all = 'all',
}

export class ListLeads360QueryDto {
  /** Busca por nome OU telefone (substring case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Filtro derivado do `leadIntent` da última análise. */
  @IsOptional()
  @IsEnum(LeadTemperatureFilter)
  temperature?: LeadTemperatureFilter;

  /** matched = tem CrmLead; unmatched = só Contact; all = ambos. */
  @IsOptional()
  @IsEnum(LeadCrmFilter)
  crm?: LeadCrmFilter;

  /** Filtra apenas leads atribuídos a este broker (via CrmLead.brokerId). */
  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsInt()
  brokerId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsInt()
  @Min(0)
  offset?: number;
}
