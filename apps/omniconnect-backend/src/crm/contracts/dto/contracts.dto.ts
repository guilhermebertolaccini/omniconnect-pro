import { ApiPropertyOptional } from '@nestjs/swagger';
import { CrmContractStatus } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Cria um contrato a partir de uma proposta aceita. Snapshot dos campos
 * (propertyName/unitNumber/clientName/clientCpfCnpj/brokerName) é feito
 * pelo service para que o contrato sobreviva a rename/exclusão.
 */
export class CreateCrmContractDto {
  @IsUUID()
  proposalId!: string;

  @ApiPropertyOptional({
    description:
      'paymentCondition pode sobrescrever o da proposta (ex.: parcelas finais negociadas). Se ausente, herda da proposta.',
  })
  @IsOptional()
  @IsObject()
  paymentCondition?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCrmContractDto {
  @IsOptional()
  @IsObject()
  paymentCondition?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pdfUrl?: string | null;
}

export class TransitionCrmContractDto {
  @IsEnum(CrmContractStatus)
  status!: CrmContractStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
