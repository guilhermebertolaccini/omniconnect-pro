import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { MessageBrokerStatus } from '@prisma/client';

/**
 * Atualização parcial de MessageBroker. `channel` é imutável após criação
 * (alterar canal = criar broker novo). Credenciais ausentes preservam o
 * valor atual; credenciais `null`/`""` apagam.
 */
export class UpdateMessageBrokerDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsEnum(MessageBrokerStatus)
  status?: MessageBrokerStatus;

  @IsOptional()
  @IsBoolean()
  autoDisableOnBounce?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyCostCents?: number;

  @IsOptional()
  @IsString()
  fallbackBrokerId?: string | null;

  @IsOptional()
  @IsObject()
  statusMap?: Record<string, string>;

  @IsOptional()
  @IsString()
  apiKey?: string | null;

  @IsOptional()
  @IsString()
  apiSecret?: string | null;

  @IsOptional()
  @IsString()
  webhookSecret?: string | null;
}
