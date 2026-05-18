import { IsEnum, IsOptional, IsString, IsBoolean, IsObject, IsDateString } from 'class-validator';
import { AdPlatform } from '@prisma/client';

export class CreateAdPlatformConnectionDto {
  @IsString()
  advertiserCompanyId!: string;

  @IsEnum(AdPlatform)
  platform!: AdPlatform;

  @IsOptional()
  @IsString()
  accountId?: string;

  // Plaintext OAuth access token. Never stored as-is — service encrypts
  // with BridgeSecretCipher before persisting. Optional on create (can be
  // filled later via /:id/credentials).
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

  // Provider-specific extras kept opaque (e.g. Meta app_id/app_secret,
  // Google customer_id, TikTok advertiser_id). Service does not interpret.
  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}
