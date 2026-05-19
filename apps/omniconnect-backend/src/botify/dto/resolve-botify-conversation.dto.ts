import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ResolveBotifyConversationDto {
  @IsUUID()
  botId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(40)
  contactPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string;
}
