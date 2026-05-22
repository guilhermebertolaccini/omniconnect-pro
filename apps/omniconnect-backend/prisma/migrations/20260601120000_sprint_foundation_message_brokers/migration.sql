-- Sprint Foundation — F1: MessageBroker
-- Provedores de canal outbound (SMS / Email / RCS). WhatsApp continua em
-- `lines/` (Meta Cloud). Pré-requisito da Régua de Acionamento (ADR-0005).
-- Credenciais cifradas via BridgeSecretCipher (AES-256-GCM, formato
-- versionado v1.<iv>.<tag>.<ct>).

CREATE TYPE "MessageBrokerChannel" AS ENUM ('sms', 'email', 'rcs');
CREATE TYPE "MessageBrokerStatus" AS ENUM ('connected', 'attention', 'disconnected');

CREATE TABLE "MessageBroker" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "MessageBrokerChannel" NOT NULL,
    "vendor" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "MessageBrokerStatus" NOT NULL DEFAULT 'connected',
    "autoDisableOnBounce" BOOLEAN NOT NULL DEFAULT true,
    "monthlyCostCents" INTEGER NOT NULL DEFAULT 0,
    "fallbackBrokerId" TEXT,
    "statusMap" JSONB NOT NULL,
    "apiKeyEncrypted" TEXT,
    "apiSecretEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER,

    CONSTRAINT "MessageBroker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessageBroker_tenantId_idx" ON "MessageBroker"("tenantId");
CREATE INDEX "MessageBroker_tenantId_channel_idx" ON "MessageBroker"("tenantId", "channel");
CREATE INDEX "MessageBroker_tenantId_status_idx" ON "MessageBroker"("tenantId", "status");

ALTER TABLE "MessageBroker" ADD CONSTRAINT "MessageBroker_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageBroker" ADD CONSTRAINT "MessageBroker_fallbackBrokerId_fkey"
    FOREIGN KEY ("fallbackBrokerId") REFERENCES "MessageBroker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
