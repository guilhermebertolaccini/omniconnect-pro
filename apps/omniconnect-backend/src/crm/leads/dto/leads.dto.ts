import { ApiPropertyOptional } from '@nestjs/swagger';
import { CrmInteractionType, CrmLeadStage } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCrmLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @ApiPropertyOptional({ enum: CrmLeadStage })
  @IsOptional()
  @IsEnum(CrmLeadStage)
  stage?: CrmLeadStage;

  @IsOptional()
  @IsInt()
  brokerId?: number;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  propertyInterest?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCrmLeadDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string | null;

  @IsOptional()
  @IsEnum(CrmLeadStage)
  stage?: CrmLeadStage;

  @IsOptional()
  @IsInt()
  brokerId?: number | null;

  @IsOptional()
  @IsUUID()
  propertyId?: string | null;

  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  propertyInterest?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedValue?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateCrmInteractionDto {
  @IsUUID()
  leadId!: string;

  @IsEnum(CrmInteractionType)
  type!: CrmInteractionType;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;
}

export class CreateCrmFollowUpDto {
  @IsUUID()
  leadId!: string;

  @IsString()
  scheduledAt!: string; // ISO

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCrmFollowUpDto {
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  status?: 'pending' | 'done' | 'cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
