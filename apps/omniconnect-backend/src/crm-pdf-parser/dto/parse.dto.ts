import { CrmDocumentParentType } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class ParseCrmDocumentDto {
  @IsEnum(CrmDocumentParentType)
  kind!: CrmDocumentParentType;

  /**
   * Texto bruto extraído do PDF no frontend (via pdf.js). Limitamos a
   * 50 000 caracteres para evitar prompts gigantes que estouram orçamento.
   */
  @IsString()
  @MinLength(10)
  @MaxLength(50_000)
  text!: string;
}
