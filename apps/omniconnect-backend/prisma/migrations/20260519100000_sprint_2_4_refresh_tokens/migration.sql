-- Sprint 2.4 — Auth refresh tokens
-- Tabela de refresh tokens rotativos. Armazena SHA-256 hex do segredo
-- bruto (`tokenHash`), nunca o segredo em si. Rotação encadeada via
-- `successorId` (unique) permite detectar reuse.

CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "userId"      INTEGER NOT NULL,
    "tokenHash"   TEXT NOT NULL,
    "userAgent"   TEXT,
    "ipAddress"   TEXT,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "revokedAt"   TIMESTAMP(3),
    "successorId" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key"
    ON "RefreshToken" ("tokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_successorId_key"
    ON "RefreshToken" ("successorId");

CREATE INDEX IF NOT EXISTS "RefreshToken_tenantId_idx"
    ON "RefreshToken" ("tenantId");

CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx"
    ON "RefreshToken" ("userId");

CREATE INDEX IF NOT EXISTS "RefreshToken_tenantId_userId_idx"
    ON "RefreshToken" ("tenantId", "userId");

CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx"
    ON "RefreshToken" ("expiresAt");

CREATE INDEX IF NOT EXISTS "RefreshToken_revokedAt_idx"
    ON "RefreshToken" ("revokedAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RefreshToken_tenantId_fkey'
    ) THEN
        ALTER TABLE "RefreshToken"
            ADD CONSTRAINT "RefreshToken_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RefreshToken_userId_fkey'
    ) THEN
        ALTER TABLE "RefreshToken"
            ADD CONSTRAINT "RefreshToken_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RefreshToken_successorId_fkey'
    ) THEN
        ALTER TABLE "RefreshToken"
            ADD CONSTRAINT "RefreshToken_successorId_fkey"
            FOREIGN KEY ("successorId") REFERENCES "RefreshToken"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
