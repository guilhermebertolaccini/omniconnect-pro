import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * DTO base para empreendimentos imobiliários (CrmProperty).
 *
 * `towers` e `documents` são JSON livres no schema porque o crm-imobiliario
 * original guarda estrutura específica (lista de torres, lista de docs de
 * cartório, etc) que pode evoluir. Validamos só que são arrays.
 */
export class CreateCrmPropertyDto {
  @MinLength(1)
  @MaxLength(255)
  @IsString()
  name!: string;

  @MinLength(1)
  @MaxLength(500)
  @IsString()
  address!: string;

  @MinLength(1)
  @MaxLength(120)
  @IsString()
  city!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  developer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  imageUrl?: string;

  @ApiPropertyOptional({ type: 'array' })
  @IsOptional()
  @IsArray()
  towers?: unknown[];

  @ApiPropertyOptional({ type: 'array' })
  @IsOptional()
  @IsArray()
  documents?: unknown[];
}

export class UpdateCrmPropertyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  developer?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  imageUrl?: string | null;

  @IsOptional()
  @IsArray()
  towers?: unknown[];

  @IsOptional()
  @IsArray()
  documents?: unknown[];
}

export class CommissionConfigDto {
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPercent!: number;
}
