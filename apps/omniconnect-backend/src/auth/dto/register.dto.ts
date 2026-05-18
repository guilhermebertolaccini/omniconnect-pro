import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Self-service signup: cria User + Tenant + UserTenant(admin) atomicamente.
 * Gated por ALLOW_PUBLIC_TENANT_SIGNUP (default true em dev, false em prod).
 * Convidados devem usar /tenant-invitations/by-token/:token/accept em vez deste
 * endpoint.
 */
export class RegisterDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 200 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @ApiProperty({
    description: 'Nome do tenant/agência a ser criado.',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  tenantName: string;
}
