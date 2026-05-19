import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { BotifyMessageRole } from '@prisma/client';

export class AppendBotifyMessageDto {
  @IsEnum(BotifyMessageRole)
  role!: BotifyMessageRole;

  @IsString()
  @MaxLength(8000)
  content!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
