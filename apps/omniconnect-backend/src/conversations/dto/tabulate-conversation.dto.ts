import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class TabulateConversationDto {
  @IsNumber()
  @IsNotEmpty()
  tabulationId: number;

  @IsNumber()
  @IsOptional()
  userLine?: number;
}
