import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { SystemEventsModule } from '../system-events/system-events.module';
import { CrmModule } from '../crm/crm.module';
import { CrmRealtimeModule } from '../crm-realtime/crm-realtime.module';
import { CrmSignaturesController } from './crm-signatures.controller';
import { CrmSignaturesWebhookController } from './crm-signatures-webhook.controller';
import { CrmSignaturesService } from './crm-signatures.service';
import { ClicksignClient } from './clicksign.client';

/**
 * CrmSignaturesModule (Sprint 3 — Bloco C). Implementa o ciclo de
 * assinatura de contratos via Clicksign:
 *   - POST /crm/signatures/contracts/:contractId/envelope (autenticado)
 *   - GET  /crm/signatures/contracts/:contractId         (autenticado)
 *   - POST /webhooks/crm/signatures                      (público, HMAC)
 *
 * Depende do CrmModule (CrmContractsService.markSignedInternal) para
 * disparar o trigger SQL on-signed quando todas as assinaturas concluem.
 */
@Module({
  imports: [ConfigModule, SystemEventsModule, CrmModule, CrmRealtimeModule],
  controllers: [CrmSignaturesController, CrmSignaturesWebhookController],
  providers: [
    PrismaService,
    BridgeSecretCipher,
    ClicksignClient,
    CrmSignaturesService,
  ],
  exports: [CrmSignaturesService],
})
export class CrmSignaturesModule {}
