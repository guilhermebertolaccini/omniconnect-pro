import { ApiPropertyOptional } from '@nestjs/swagger';
import { CrmClientScore } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const CPF_CNPJ_REGEX = /^[\d./-]{11,18}$/;

export class CreateCrmClientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ description: 'CPF/CNPJ aceita com ou sem máscara.' })
  @IsOptional()
  @IsString()
  @Matches(CPF_CNPJ_REGEX, { message: 'cpfCnpj must be a CPF or CNPJ string' })
  cpfCnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  income?: number;

  @IsOptional()
  @IsEnum(CrmClientScore)
  score?: CrmClientScore;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsInt()
  brokerId?: number;
}

export class UpdateCrmClientDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(CPF_CNPJ_REGEX)
  cpfCnpj?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  income?: number | null;

  @IsOptional()
  @IsEnum(CrmClientScore)
  score?: CrmClientScore | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsInt()
  brokerId?: number | null;
}
