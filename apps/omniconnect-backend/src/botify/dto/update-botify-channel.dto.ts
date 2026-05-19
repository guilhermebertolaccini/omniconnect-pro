import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateBotifyChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phoneNumberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  accessToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  webhookSecret?: string;

  @ApiPropertyOptional({ description: 'Meta WABA account id (entry.id no webhook)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  metaWabaAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  evolutionInstance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  evolutionApiKey?: string;

  @ApiPropertyOptional({ description: 'Fluxo publicado a executar no webhook' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultFlowId?: string;
}
