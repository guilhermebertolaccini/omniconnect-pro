import { CrmCommissionStatus, CrmPaymentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class MarkPaymentDto {
  @IsEnum(CrmPaymentStatus)
  status!: CrmPaymentStatus;

  @IsOptional()
  @IsString()
  paidAt?: string;
}

export class MarkCommissionDto {
  @IsEnum(CrmCommissionStatus)
  status!: CrmCommissionStatus;

  @IsOptional()
  @IsString()
  paidAt?: string;
}
