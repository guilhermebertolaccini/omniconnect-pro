-- Sprint Quick-wins — Q2: LineHealthPolicy
-- Política per-tenant de alertas e ações sobre saúde de linha WhatsApp.
-- Score continua sendo calculado por `line-reputation` (módulo existente);
-- esta tabela apenas guarda as preferências do tenant.

CREATE TYPE "LineHealthAction" AS ENUM ('none', 'throttle', 'block');

CREATE TABLE "LineHealthPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alertHoursMedium" INTEGER NOT NULL DEFAULT 6,
    "alertHoursLow" INTEGER NOT NULL DEFAULT 2,
    "autoActionOnCritical" "LineHealthAction" NOT NULL DEFAULT 'none',
    "autoActionOnHigh" "LineHealthAction" NOT NULL DEFAULT 'none',
    "suggestRotation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineHealthPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineHealthPolicy_tenantId_key" ON "LineHealthPolicy"("tenantId");
CREATE INDEX "LineHealthPolicy_tenantId_idx" ON "LineHealthPolicy"("tenantId");

ALTER TABLE "LineHealthPolicy" ADD CONSTRAINT "LineHealthPolicy_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
