import { IsInt, Min } from 'class-validator';

/**
 * Upsert do custo unitário de envio para um canal específico.
 * Canal vem na URL (`PUT /channels/:channel`); body só carrega o custo.
 */
export class UpsertChannelCostDto {
  @IsInt()
  @Min(0)
  costCents!: number;
}
