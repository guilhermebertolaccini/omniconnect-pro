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
import { MessageBrokerChannel, MessageBrokerStatus } from '@prisma/client';

/**
 * Cria um MessageBroker (provedor de canal outbound). Credenciais entram
 * em plaintext aqui e são cifradas pelo service via BridgeSecretCipher
 * antes de persistir. Nenhum endpoint subsequente devolve plaintext.
 */
export class CreateMessageBrokerDto {
  @IsEnum(MessageBrokerChannel)
  channel!: MessageBrokerChannel;

  /** Identificador do vendor — 'twilio' | 'sendgrid' | 'pulse' | 'custom' etc. */
  @IsString()
  @MaxLength(64)
  vendor!: string;

  /** Nome display para a UI. */
  @IsString()
  @MaxLength(120)
  label!: string;

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

  /** Id de outro MessageBroker do mesmo tenant a usar como fallback. */
  @IsOptional()
  @IsString()
  fallbackBrokerId?: string;

  /**
   * Map vendor-specific status → canônico
   * (`sent`, `invalid`, `duplicated`, `spam`, `bounced`).
   * Service não interpreta o conteúdo — só armazena.
   */
  @IsObject()
  statusMap!: Record<string, string>;

  /** Plaintext credentials — service cifra antes de persistir. */
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;
}
