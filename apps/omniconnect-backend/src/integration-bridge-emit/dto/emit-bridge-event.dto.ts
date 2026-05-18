import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { IntegrationProvider } from '../../integration-events/integration-events.service';

const PROVIDERS: IntegrationProvider[] = ['crm', 'ads', 'bot'];

export class EmitBridgeEventDto {
  @ApiProperty({
    description: 'IntegrationConnection.id (must belong to the authenticated tenant)',
  })
  @IsUUID()
  connectionId!: string;

  @ApiProperty({ enum: PROVIDERS })
  @IsIn(PROVIDERS)
  provider!: IntegrationProvider;

  @ApiProperty({
    description:
      'Bridge contract eventType (e.g. crm.lead.created, ads.lead.created, botify.handoff.created)',
    maxLength: 120,
  })
  @IsString()
  @MaxLength(120)
  eventType!: string;

  @ApiProperty({ description: 'Stable id in the emitting app', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  externalId!: string;

  @ApiPropertyOptional({ description: 'ISO-8601 timestamp; defaults to now' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  occurredAt?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiProperty({ description: 'Opaque payload forwarded to bridge processors' })
  @IsObject()
  data!: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Optional idempotency key; default is a deterministic hash of tenant+connection+payload',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  idempotencyKey?: string;
}
