import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateBotifyFlowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  botId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  triggerKeyword?: string;

  @ApiPropertyOptional({ type: 'array' })
  @IsOptional()
  @IsArray()
  nodes?: unknown[];
}
