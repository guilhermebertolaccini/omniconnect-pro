import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SimulateBotifyFlowDto {
  @ApiProperty()
  @IsUUID()
  flowId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(0)
  @MaxLength(4000)
  text!: string;
}
