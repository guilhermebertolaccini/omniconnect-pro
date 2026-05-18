-- Sprint 4 bridge processors: explicit external id mapping.
-- Tenant scope is denormalized to make cross-tenant lookups impossible
-- without an explicit tenantId predicate.
CREATE TABLE "IntegrationEntityLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationEntityLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationEntityLink_tenantId_provider_externalId_entityType_key"
ON "IntegrationEntityLink"("tenantId", "provider", "externalId", "entityType");

CREATE INDEX "IntegrationEntityLink_tenantId_idx"
ON "IntegrationEntityLink"("tenantId");

CREATE INDEX "IntegrationEntityLink_tenantId_provider_idx"
ON "IntegrationEntityLink"("tenantId", "provider");

CREATE INDEX "IntegrationEntityLink_tenantId_entityType_entityId_idx"
ON "IntegrationEntityLink"("tenantId", "entityType", "entityId");

CREATE INDEX "IntegrationEntityLink_tenantId_provider_externalId_idx"
ON "IntegrationEntityLink"("tenantId", "provider", "externalId");

ALTER TABLE "IntegrationEntityLink"
ADD CONSTRAINT "IntegrationEntityLink_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
