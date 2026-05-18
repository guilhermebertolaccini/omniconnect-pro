import { CrmDocumentParentType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UploadCrmDocumentDto {
  @IsEnum(CrmDocumentParentType)
  parentType!: CrmDocumentParentType;

  @IsUUID()
  parentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}
