import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Top-up manual (credit) ou ajuste (refund). Tipo é fixo no controller
 * (POST /credits ⇒ `credit`); este DTO carrega só o valor e metadados de
 * auditoria.
 */
export class CreditWalletDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  /** Identificador opcional do canal (em refund, usa o canal do débito original). */
  @IsOptional()
  @IsString()
  channel?: string;

  /** Razão livre — vai pro `metadata.reason` no `WalletTransaction`. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
