import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ImportWpBotifyBotDto {
  @ApiProperty({ description: 'Id estável no WordPress (ex.: post id)' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  externalSourceId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class ImportWpBotifyFlowDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  externalSourceId!: string;

  @ApiProperty({ description: 'externalSourceId do bot pai (importado no mesmo payload)' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  botExternalSourceId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  triggerKeyword?: string;

  @ApiProperty({ type: 'array' })
  @IsArray()
  nodes!: unknown[];
}

export class ImportWordpressSnapshotDto {
  @ApiProperty({ type: [ImportWpBotifyBotDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportWpBotifyBotDto)
  bots!: ImportWpBotifyBotDto[];

  @ApiProperty({ type: [ImportWpBotifyFlowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportWpBotifyFlowDto)
  flows!: ImportWpBotifyFlowDto[];
}
