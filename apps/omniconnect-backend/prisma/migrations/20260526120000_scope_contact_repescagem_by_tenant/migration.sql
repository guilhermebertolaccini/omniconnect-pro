-- Repescagem belongs to the active tenant. The former unique key prevented
-- independent state for the same operator/contact combination in two tenants.
DROP INDEX IF EXISTS "ContactRepescagem_contactPhone_operatorId_key";

CREATE UNIQUE INDEX "ContactRepescagem_tenantId_contactPhone_operatorId_key"
ON "ContactRepescagem"("tenantId", "contactPhone", "operatorId");
