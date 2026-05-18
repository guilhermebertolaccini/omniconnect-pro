import { ApiPropertyOptional } from '@nestjs/swagger';
import { CrmUnitStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCrmUnitDto {
  @IsUUID()
  propertyId!: string;

  @IsString()
  @MaxLength(50)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tower?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  typology?: string;

  @IsOptional()
  @IsInt()
  floor?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  area?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: CrmUnitStatus })
  @IsOptional()
  @IsEnum(CrmUnitStatus)
  status?: CrmUnitStatus;

  @IsOptional()
  @IsString()
  observations?: string;
}

export class UpdateCrmUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tower?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  typology?: string | null;

  @IsOptional()
  @IsInt()
  floor?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  area?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number | null;

  @IsOptional()
  @IsString()
  observations?: string | null;
}

/**
 * Atualizar status (workflow: available → reserved → sold). Reservas
 * exigem clientId; venda fica a cargo do contrato (trigger SQL).
 */
export class UpdateCrmUnitStatusDto {
  @IsEnum(CrmUnitStatus)
  status!: CrmUnitStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @IsOptional()
  @IsString()
  reservationExpiry?: string | null;
}
