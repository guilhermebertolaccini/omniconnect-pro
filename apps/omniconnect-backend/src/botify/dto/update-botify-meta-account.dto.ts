import { PartialType } from '@nestjs/swagger';
import { CreateBotifyMetaAccountDto } from './create-botify-meta-account.dto';

export class UpdateBotifyMetaAccountDto extends PartialType(CreateBotifyMetaAccountDto) {}
