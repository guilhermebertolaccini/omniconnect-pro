import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateTenantInvitationDto {
  @ApiProperty({ description: 'Email do convidado. Case-insensitive.' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: Role, description: 'Role do convidado dentro do tenant.' })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({
    description:
      'Override do TTL em horas. Default lido de TENANT_INVITATION_TTL_HOURS (fallback 168h).',
    minimum: 1,
    maximum: 24 * 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  ttlHours?: number;
}
