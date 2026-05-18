import { IsBoolean, IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateAdPlatformConnectionDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  // Optional rotation: new plaintext access token. Encrypted before save.
  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsDateString()
  tokenExpiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}
