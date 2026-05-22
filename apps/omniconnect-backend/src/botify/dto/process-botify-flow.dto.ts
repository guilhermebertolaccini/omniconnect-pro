import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Body do endpoint persistente do engine Botify (G3).
 *
 * - `flowId` + `botId` identificam o fluxo e o bot dono.
 * - `phone` é o canal de contato (E.164 sem `+` ou com — backend normaliza).
 * - `text` é a mensagem recebida do usuário.
 * - `dryRun=true` mantém comportamento do `/simulate` (não persiste,
 *   não emite handoff, não chama LLM em produção real — fallback ainda
 *   funciona pra exercitar o caminho).
 */
export class ProcessBotifyFlowDto {
  @ApiProperty()
  @IsUUID()
  flowId!: string;

  @ApiProperty()
  @IsUUID()
  botId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(0)
  @MaxLength(4000)
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
