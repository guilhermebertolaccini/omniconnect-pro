-- Sprint 1.1: AI usage hardening + integration event tracking
-- 1) Create IntegrationConnection (previously declared in schema but never migrated)
-- 2) Create IntegrationEvent for webhook idempotency + audit trail
-- 3) Extend AIUsageLog with billing-grade fields (status, errorCode, currency, etc.)
-- 4) Add tenant-scoped composite indexes for high-volume tables
--
-- All changes are additive / non-destructive: existing rows keep working.
-- We do not change `tenantId String @default("default-tenant")` defaults at the
-- schema level on purpose — enforcement is moved up to the application layer
-- (see src/common/utils/tenant-context.ts).

-- CreateTable: IntegrationConnection
CREATE TABLE IF NOT EXISTS "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IntegrationConnection)
CREATE INDEX IF NOT EXISTS "IntegrationConnection_tenantId_idx"
    ON "IntegrationConnection"("tenantId");
CREATE INDEX IF NOT EXISTS "IntegrationConnection_provider_idx"
    ON "IntegrationConnection"("provider");
CREATE INDEX IF NOT EXISTS "IntegrationConnection_tenantId_provider_idx"
    ON "IntegrationConnection"("tenantId", "provider");

-- AddForeignKey (IntegrationConnection -> Tenant)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationConnection_tenantId_fkey'
    ) THEN
        ALTER TABLE "IntegrationConnection"
            ADD CONSTRAINT "IntegrationConnection_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- CreateTable: IntegrationEvent (webhook audit trail + idempotency)
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "signature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IntegrationEvent)
CREATE UNIQUE INDEX "IntegrationEvent_idempotencyKey_key"
    ON "IntegrationEvent"("idempotencyKey");
CREATE INDEX "IntegrationEvent_tenantId_idx"
    ON "IntegrationEvent"("tenantId");
CREATE INDEX "IntegrationEvent_tenantId_provider_idx"
    ON "IntegrationEvent"("tenantId", "provider");
CREATE INDEX "IntegrationEvent_tenantId_status_idx"
    ON "IntegrationEvent"("tenantId", "status");
CREATE INDEX "IntegrationEvent_tenantId_createdAt_idx"
    ON "IntegrationEvent"("tenantId", "createdAt");
CREATE INDEX "IntegrationEvent_connectionId_idx"
    ON "IntegrationEvent"("connectionId");

-- AddForeignKey (IntegrationEvent)
ALTER TABLE "IntegrationEvent"
    ADD CONSTRAINT "IntegrationEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationEvent"
    ADD CONSTRAINT "IntegrationEvent_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: AIUsageLog — add billing-grade tracking fields
ALTER TABLE "AIUsageLog"
    ADD COLUMN "analysisId" INTEGER,
    ADD COLUMN "operationType" TEXT NOT NULL DEFAULT 'conversation_analysis',
    ADD COLUMN "promptVersion" TEXT,
    ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'success',
    ADD COLUMN "errorCode" TEXT,
    ADD COLUMN "errorMessage" TEXT;

-- CreateIndex (AIUsageLog) — tenant-scoped composite indexes
CREATE INDEX "AIUsageLog_tenantId_createdAt_idx"
    ON "AIUsageLog"("tenantId", "createdAt");
CREATE INDEX "AIUsageLog_tenantId_operationType_idx"
    ON "AIUsageLog"("tenantId", "operationType");
CREATE INDEX "AIUsageLog_tenantId_status_idx"
    ON "AIUsageLog"("tenantId", "status");
