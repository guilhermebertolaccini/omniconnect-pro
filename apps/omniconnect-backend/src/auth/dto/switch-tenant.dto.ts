import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SwitchTenantDto {
  @ApiProperty({
    description: 'Identificador do tenant para o qual a sessao deve ser escopada.',
    example: '8cf82420-424a-4f05-b559-7f4042ae3c75',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  tenantId!: string;
}
