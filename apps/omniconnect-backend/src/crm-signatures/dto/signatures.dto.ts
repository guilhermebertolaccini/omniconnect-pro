import { IsArray, IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CrmSignerDto {
  @IsString()
  @MaxLength(80)
  role!: string; // ex: 'buyer', 'seller', 'witness'

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;
}

/**
 * Cria envelope para um contrato. Os signers vão para Clicksign (ou outro
 * provider configurado) e a tabela CrmSignature ganha 1 row por role.
 *
 * `note` é opcional e vai para o body do envelope no provider (LGPD: nada
 * de CPF/CNPJ aqui — esses dados estão dentro do PDF gerado pelo CRM).
 */
export class CreateSignatureEnvelopeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrmSignerDto)
  signers!: CrmSignerDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
