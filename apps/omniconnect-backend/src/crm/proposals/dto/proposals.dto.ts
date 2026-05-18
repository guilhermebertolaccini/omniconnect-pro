import { ApiPropertyOptional } from '@nestjs/swagger';
import { CrmProposalStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * paymentCondition esperado:
 *   { downPayment?: number, installments?: [{amount, dueDate, type}], ... }
 * Não validamos o shape interno aqui — o trigger SQL on-signed só lê
 * `installments` e segue defaults; campos extras são livres para evolução.
 */
export class CreateCrmProposalDto {
  @IsUUID()
  propertyId!: string;

  @IsUUID()
  unitId!: string;

  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({
    description:
      'brokerId. Apenas admin/supervisor pode definir. Brokers são auto-atribuídos.',
  })
  @IsOptional()
  @IsInt()
  brokerId?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  originalPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountPercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  finalPrice?: number;

  @IsOptional()
  @IsObject()
  paymentCondition?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCrmProposalDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  originalPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountPercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  finalPrice?: number;

  @IsOptional()
  @IsObject()
  paymentCondition?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  validUntil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pdfUrl?: string | null;
}

export class TransitionCrmProposalDto {
  @IsEnum(CrmProposalStatus)
  status!: CrmProposalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
