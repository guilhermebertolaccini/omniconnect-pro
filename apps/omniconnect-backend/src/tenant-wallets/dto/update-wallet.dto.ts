import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { WalletGuardMode, WalletResetCycle } from '@prisma/client';

/**
 * Atualização parcial de TenantWallet. Todos os campos opcionais; campos
 * ausentes preservam o valor atual.
 */
export class UpdateWalletDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  totalBudgetCents?: number;

  @IsOptional()
  @IsEnum(WalletResetCycle)
  resetCycle?: WalletResetCycle;

  @IsOptional()
  @IsDateString()
  resetAt?: string;

  @IsOptional()
  @IsEnum(WalletGuardMode)
  guardMode?: WalletGuardMode;

  @IsOptional()
  @IsBoolean()
  realtimeDebit?: boolean;
}
