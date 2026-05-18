import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsBoolean, Min, Max } from 'class-validator';

export class AnalyzeConversationDto {
  @ApiPropertyOptional({ description: 'Telefone do contato (E.164)' })
  @IsOptional() @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Janela em dias para buscar conversas', default: 30 })
  @IsOptional() @IsInt() @Min(1) @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: 'Limite de mensagens', default: 80 })
  @IsOptional() @IsInt() @Min(1) @Max(1000)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filtrar por segmento' })
  @IsOptional() @IsInt()
  segment?: number;

  @ApiPropertyOptional({ description: 'Filtrar por operador' })
  @IsOptional() @IsInt()
  userId?: number;

  @ApiPropertyOptional({ description: 'Persistir resultado na tabela', default: true })
  @IsOptional() @IsBoolean()
  persist?: boolean;
}
