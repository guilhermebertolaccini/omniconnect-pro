-- Sprint 1.3 — Bridges security hardening
--
-- 1. Rename IntegrationConnection.secretHash -> webhookSecretEncrypted
--    The previous name was misleading: the column stored the shared
--    HMAC secret in plaintext (used directly as the HMAC key), not a
--    hash of it. Renaming clarifies intent and the application layer
--    now stores values encrypted with AES-256-GCM via
--    BridgeSecretCipher.
--
-- 2. Move IntegrationEvent.idempotencyKey from a global @unique to a
--    composite unique (tenantId, provider, idempotencyKey). A global
--    unique caused cross-tenant collisions to be silently swallowed
--    as duplicates. Idempotency MUST be scoped to the (tenant,
--    provider) pair.

ALTER TABLE "IntegrationConnection"
  RENAME COLUMN "secretHash" TO "webhookSecretEncrypted";

-- Drop the global unique constraint on idempotencyKey if present
-- (Prisma's default generated name is "<Model>_<field>_key").
ALTER TABLE "IntegrationEvent"
  DROP CONSTRAINT IF EXISTS "IntegrationEvent_idempotencyKey_key";
DROP INDEX IF EXISTS "IntegrationEvent_idempotencyKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationEvent_tenantId_provider_idempotencyKey_key"
  ON "IntegrationEvent" ("tenantId", "provider", "idempotencyKey");
