import { PartialType } from '@nestjs/mapped-types';
import { CreateBotifyBotDto } from './create-bot.dto';

export class UpdateBotifyBotDto extends PartialType(CreateBotifyBotDto) {}
