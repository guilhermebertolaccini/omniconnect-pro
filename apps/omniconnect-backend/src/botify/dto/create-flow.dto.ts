import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateBotifyFlowDto {
  @ApiProperty()
  @IsUUID()
  botId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  triggerKeyword?: string;

  @ApiPropertyOptional({
    description: 'Nós no formato legado editor (`connections[]` por nó), ver `@omniconnect/shared-types`.',
    type: 'array',
  })
  @IsOptional()
  @IsArray()
  nodes?: unknown[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalSourceId?: string;
}
