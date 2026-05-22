import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export type PilotOverviewOrigin = 'all' | 'ads' | 'hsm' | 'organic';

/**
 * Query params for `GET /dashboards/pilot-overview` (Sprint Hub / PR 4 — A6).
 *
 * Janela: `from` + `to` (ISO 8601) juntos, OU omitir ambos para usar
 * `days` (rolling, default 30, max 365).
 *
 * `origin` é placeholder do pilot doc — hoje só `ads` afeta a contagem de
 * leads ingeridos. `hsm` / `organic` exigem taxonomia adicional (templates
 * WhatsApp outbound vs inbound espontâneo) que está fora do PR 4; passar
 * estes valores devolve as mesmas contagens que `all` e a resposta reflete
 * `origin` recebido para auditoria.
 */
export class PilotOverviewQueryDto {
  @ApiPropertyOptional({
    description: 'Rolling window in days when from/to omitted',
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: 'Interval start (ISO 8601). Must be sent with `to`.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Interval end (ISO 8601). Must be sent with `from`.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Origin filter (placeholder — só `ads` afeta hoje).',
    enum: ['all', 'ads', 'hsm', 'organic'],
  })
  @IsOptional()
  @IsIn(['all', 'ads', 'hsm', 'organic'])
  origin?: PilotOverviewOrigin;
}
