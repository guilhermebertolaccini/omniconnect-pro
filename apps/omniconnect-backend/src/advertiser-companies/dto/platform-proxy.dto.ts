import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body for POST /advertiser-companies/:id/platforms/:platform/proxy
 * Mirrors the shape of the Supabase `meta-api-proxy` edge function so
 * the frontend cutover can keep using the same payload.
 */
export class PlatformProxyDto {
  // Provider-relative path (e.g. "/me/adaccounts", "/act_123/campaigns").
  // Must start with "/". Service refuses ".." or absolute URLs.
  @IsString()
  endpoint!: string;

  @IsOptional()
  @IsIn(['GET', 'POST', 'DELETE'])
  method?: 'GET' | 'POST' | 'DELETE';

  // Querystring params (string -> string). Plain object only.
  @IsOptional()
  @IsObject()
  params?: Record<string, string>;

  // Optional JSON body for POST/DELETE.
  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;
}
