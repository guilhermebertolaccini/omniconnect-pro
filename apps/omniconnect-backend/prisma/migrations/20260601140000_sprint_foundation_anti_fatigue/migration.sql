-- Sprint Foundation — F3: AntiFatigueRule
-- Pré-requisito de execução da Régua de Acionamento (ADR-0005).
-- Uma regra global por tenant + log de dedupe para auditoria.

CREATE TYPE "AntiFatigueAppliesTo" AS ENUM ('phone', 'document', 'both');

CREATE TABLE "AntiFatigueRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "windowHours" INTEGER NOT NULL DEFAULT 24,
    "appliesTo" "AntiFatigueAppliesTo" NOT NULL DEFAULT 'both',
    "allowBypassForUrgent" BOOLEAN NOT NULL DEFAULT false,
    "businessHoursStart" TEXT,
    "businessHoursEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AntiFatigueRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AntiFatigueRule_tenantId_key" ON "AntiFatigueRule"("tenantId");
CREATE INDEX "AntiFatigueRule_tenantId_idx" ON "AntiFatigueRule"("tenantId");

ALTER TABLE "AntiFatigueRule" ADD CONSTRAINT "AntiFatigueRule_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AntiFatigueDedupeLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refType" TEXT,
    "refId" TEXT,

    CONSTRAINT "AntiFatigueDedupeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AntiFatigueDedupeLog_tenantId_idx" ON "AntiFatigueDedupeLog"("tenantId");
CREATE INDEX "AntiFatigueDedupeLog_tenantId_contactKey_blockedAt_idx" ON "AntiFatigueDedupeLog"("tenantId", "contactKey", "blockedAt");
CREATE INDEX "AntiFatigueDedupeLog_tenantId_blockedAt_idx" ON "AntiFatigueDedupeLog"("tenantId", "blockedAt");
