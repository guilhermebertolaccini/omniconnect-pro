-- Sprint 1.2 — TenantApiKey
-- Server-to-server credential storage. Plaintext is never persisted;
-- ApiKeyGuard resolves the tenant by sha256(secret) lookup on `hashedKey`.

CREATE TABLE IF NOT EXISTS "TenantApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopes" JSONB,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TenantApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantApiKey_hashedKey_key" ON "TenantApiKey"("hashedKey");
CREATE INDEX IF NOT EXISTS "TenantApiKey_tenantId_idx" ON "TenantApiKey"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantApiKey_tenantId_revokedAt_idx" ON "TenantApiKey"("tenantId", "revokedAt");
CREATE INDEX IF NOT EXISTS "TenantApiKey_prefix_idx" ON "TenantApiKey"("prefix");

ALTER TABLE "TenantApiKey"
    ADD CONSTRAINT "TenantApiKey_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantApiKey"
    ADD CONSTRAINT "TenantApiKey_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
