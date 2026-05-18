import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body opcional do POST /tenant-invitations/by-token/:token/accept.
 *
 * Três cenários suportados:
 *
 *  1. Caller autenticado (JWT) com email batendo com o do convite → body vazio.
 *  2. Caller não autenticado, account já existente com mesmo email → { password }.
 *  3. Caller não autenticado, account NOVA com aquele email → { name, password }.
 *
 * Em qualquer caso, o token é o secret real do convite (URL). Senhas vazias
 * ou < 8 chars são rejeitadas pelo class-validator.
 */
export class AcceptTenantInvitationDto {
  @ApiPropertyOptional({
    description: 'Nome do usuário ao criar account nova (cenário 3).',
    minLength: 1,
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description: 'Senha (cenários 2 e 3). Mínimo 8 caracteres.',
    minLength: 8,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;
}
