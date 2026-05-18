import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CrmRealtimeModule } from '../crm-realtime/crm-realtime.module';
import { CrmClientsController } from './clients/crm-clients.controller';
import { CrmClientsService } from './clients/crm-clients.service';
import { CrmContractsController } from './contracts/crm-contracts.controller';
import { CrmContractsService } from './contracts/crm-contracts.service';
import {
  CrmCommissionsController,
  CrmPaymentsController,
} from './financial/crm-financial.controller';
import { CrmFinancialService } from './financial/crm-financial.service';
import {
  CrmFollowUpsController,
  CrmLeadsController,
} from './leads/crm-leads.controller';
import { CrmLeadsService } from './leads/crm-leads.service';
import { CrmPropertiesController } from './properties/crm-properties.controller';
import { CrmPropertiesService } from './properties/crm-properties.service';
import { CrmProposalsController } from './proposals/crm-proposals.controller';
import { CrmProposalsService } from './proposals/crm-proposals.service';
import { CrmUnitsController } from './units/crm-units.controller';
import { CrmUnitsService } from './units/crm-units.service';

/**
 * CrmModule (Sprint 3) — domínio imobiliário do OmniconnectPRO.
 *
 * Inclui properties, units (+ commission config), clients, leads (+
 * interactions, follow-ups), proposals, contracts e financeiro (payments,
 * commissions). Os módulos Signatures (Bloco C), Storage/PDF (Bloco D) e
 * Realtime (Bloco E) vivem fora deste módulo mas dependem do
 * `CrmContractsService` (assinatura completa → markSignedInternal).
 *
 * Todos os controllers usam `JwtAuthGuard + RolesGuard`. tenantId é
 * sempre puxado de `req.user.tenantId` (jamais do body).
 */
@Module({
  imports: [CrmRealtimeModule],
  controllers: [
    CrmPropertiesController,
    CrmUnitsController,
    CrmClientsController,
    CrmLeadsController,
    CrmFollowUpsController,
    CrmProposalsController,
    CrmContractsController,
    CrmPaymentsController,
    CrmCommissionsController,
  ],
  providers: [
    PrismaService,
    CrmPropertiesService,
    CrmUnitsService,
    CrmClientsService,
    CrmLeadsService,
    CrmProposalsService,
    CrmContractsService,
    CrmFinancialService,
  ],
  exports: [
    CrmPropertiesService,
    CrmUnitsService,
    CrmClientsService,
    CrmLeadsService,
    CrmProposalsService,
    CrmContractsService,
    CrmFinancialService,
  ],
})
export class CrmModule {}
