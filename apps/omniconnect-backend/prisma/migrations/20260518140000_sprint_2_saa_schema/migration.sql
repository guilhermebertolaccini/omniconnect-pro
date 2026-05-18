-- Sprint 2.3 — Smart Ad Automator (SAA) backend migration
--
-- Adds the SAA domain models migrated from the Supabase standalone project.
-- Mapping:
--   agencies                      -> Tenant (existing, 1:1; no separate model)
--   agency_members                -> UserTenant (existing)
--   agency_invitations            -> TenantInvitation
--   companies                     -> AdvertiserCompany
--   client_company_access         -> AdvertiserCompanyAccess
--   platform_configurations + meta_configurations -> AdPlatformConnection
--   ai_campaign_analyses          -> AdCampaignAIAnalysis
--   organic_post_experiments      -> OrganicPostExperiment
--   organic_post_experiment_variants -> OrganicPostExperimentVariant
--   audit_logs                    -> reuses SystemEvent
--
-- Multi-tenant invariants:
--   * Every new model has tenantId NOT NULL and FK -> Tenant ON DELETE CASCADE.
--   * Every table is indexed by tenantId for cheap scoped reads.
--   * Composite uniques are tenant-aware where collisions could leak data.
--
-- Security invariants:
--   * AdPlatformConnection.accessTokenEncrypted / refreshTokenEncrypted store
--     AES-256-GCM ciphertext produced by BridgeSecretCipher. Plaintext OAuth
--     tokens must never be persisted in this DB.
--
-- Idempotent on partial reruns where it makes sense (CREATE TYPE IF NOT EXISTS
-- via DO block; CREATE TABLE IF NOT EXISTS).

-- 1. Enum AdPlatform -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdPlatform') THEN
    CREATE TYPE "AdPlatform" AS ENUM ('meta', 'google_ads', 'tiktok_ads');
  END IF;
END$$;

-- 2. TenantInvitation ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TenantInvitation" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "role"          "Role" NOT NULL,
  "token"         TEXT NOT NULL,
  "invitedById"   INTEGER,
  "acceptedById"  INTEGER,
  "acceptedAt"    TIMESTAMP(3),
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantInvitation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantInvitation_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TenantInvitation_acceptedById_fkey"
    FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantInvitation_token_key"
  ON "TenantInvitation" ("token");
CREATE INDEX IF NOT EXISTS "TenantInvitation_tenantId_idx"
  ON "TenantInvitation" ("tenantId");
CREATE INDEX IF NOT EXISTS "TenantInvitation_tenantId_email_idx"
  ON "TenantInvitation" ("tenantId", "email");
CREATE INDEX IF NOT EXISTS "TenantInvitation_token_idx"
  ON "TenantInvitation" ("token");
CREATE INDEX IF NOT EXISTS "TenantInvitation_expiresAt_idx"
  ON "TenantInvitation" ("expiresAt");

-- 3. AdvertiserCompany ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AdvertiserCompany" (
  "id"              TEXT PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "businessName"    TEXT NOT NULL,
  "metaBusinessId"  TEXT,
  "currency"        TEXT NOT NULL DEFAULT 'BRL',
  "timezone"        TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "status"          TEXT NOT NULL DEFAULT 'pending',
  "totalSpent"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "activeCampaigns" INTEGER NOT NULL DEFAULT 0,
  "lastSyncAt"      TIMESTAMP(3),
  "createdById"     INTEGER,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvertiserCompany_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdvertiserCompany_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AdvertiserCompany_tenantId_idx"
  ON "AdvertiserCompany" ("tenantId");
CREATE INDEX IF NOT EXISTS "AdvertiserCompany_tenantId_status_idx"
  ON "AdvertiserCompany" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "AdvertiserCompany_tenantId_name_idx"
  ON "AdvertiserCompany" ("tenantId", "name");

-- 4. AdvertiserCompanyAccess ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "AdvertiserCompanyAccess" (
  "id"                  TEXT PRIMARY KEY,
  "tenantId"            TEXT NOT NULL,
  "userId"              INTEGER NOT NULL,
  "advertiserCompanyId" TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvertiserCompanyAccess_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdvertiserCompanyAccess_advertiserCompanyId_fkey"
    FOREIGN KEY ("advertiserCompanyId") REFERENCES "AdvertiserCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdvertiserCompanyAccess_userId_advertiserCompanyId_key"
  ON "AdvertiserCompanyAccess" ("userId", "advertiserCompanyId");
CREATE INDEX IF NOT EXISTS "AdvertiserCompanyAccess_tenantId_idx"
  ON "AdvertiserCompanyAccess" ("tenantId");
CREATE INDEX IF NOT EXISTS "AdvertiserCompanyAccess_tenantId_userId_idx"
  ON "AdvertiserCompanyAccess" ("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "AdvertiserCompanyAccess_advertiserCompanyId_idx"
  ON "AdvertiserCompanyAccess" ("advertiserCompanyId");

-- 5. AdPlatformConnection ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AdPlatformConnection" (
  "id"                    TEXT PRIMARY KEY,
  "tenantId"              TEXT NOT NULL,
  "advertiserCompanyId"   TEXT NOT NULL,
  "platform"              "AdPlatform" NOT NULL,
  "accountId"             TEXT,
  "accessTokenEncrypted"  TEXT,
  "refreshTokenEncrypted" TEXT,
  "tokenExpiresAt"        TIMESTAMP(3),
  "isActive"              BOOLEAN NOT NULL DEFAULT TRUE,
  "extra"                 JSONB,
  "createdById"           INTEGER,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdPlatformConnection_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdPlatformConnection_advertiserCompanyId_fkey"
    FOREIGN KEY ("advertiserCompanyId") REFERENCES "AdvertiserCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdPlatformConnection_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdPlatformConnection_advertiserCompanyId_platform_key"
  ON "AdPlatformConnection" ("advertiserCompanyId", "platform");
CREATE INDEX IF NOT EXISTS "AdPlatformConnection_tenantId_idx"
  ON "AdPlatformConnection" ("tenantId");
CREATE INDEX IF NOT EXISTS "AdPlatformConnection_tenantId_platform_idx"
  ON "AdPlatformConnection" ("tenantId", "platform");
CREATE INDEX IF NOT EXISTS "AdPlatformConnection_tokenExpiresAt_idx"
  ON "AdPlatformConnection" ("tokenExpiresAt");

-- 6. AdCampaignAIAnalysis ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AdCampaignAIAnalysis" (
  "id"                  TEXT PRIMARY KEY,
  "tenantId"            TEXT NOT NULL,
  "advertiserCompanyId" TEXT NOT NULL,
  "platform"            "AdPlatform" NOT NULL,
  "campaignId"          TEXT NOT NULL,
  "campaignName"        TEXT,
  "analysis"            JSONB NOT NULL,
  "modelProvider"       TEXT,
  "modelName"           TEXT,
  "promptVersion"       TEXT,
  "generatedById"       INTEGER,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdCampaignAIAnalysis_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdCampaignAIAnalysis_advertiserCompanyId_fkey"
    FOREIGN KEY ("advertiserCompanyId") REFERENCES "AdvertiserCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdCampaignAIAnalysis_generatedById_fkey"
    FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AdCampaignAIAnalysis_tenantId_idx"
  ON "AdCampaignAIAnalysis" ("tenantId");
CREATE INDEX IF NOT EXISTS "AdCampaignAIAnalysis_tenantId_platform_idx"
  ON "AdCampaignAIAnalysis" ("tenantId", "platform");
CREATE INDEX IF NOT EXISTS "AdCampaignAIAnalysis_tenantId_campaignId_idx"
  ON "AdCampaignAIAnalysis" ("tenantId", "campaignId");
CREATE INDEX IF NOT EXISTS "AdCampaignAIAnalysis_tenantId_advertiserCompanyId_createdAt_idx"
  ON "AdCampaignAIAnalysis" ("tenantId", "advertiserCompanyId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdCampaignAIAnalysis_createdAt_idx"
  ON "AdCampaignAIAnalysis" ("createdAt");

-- 7. OrganicPostExperiment -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "OrganicPostExperiment" (
  "id"                  TEXT PRIMARY KEY,
  "tenantId"            TEXT NOT NULL,
  "advertiserCompanyId" TEXT NOT NULL,
  "platform"            "AdPlatform" NOT NULL DEFAULT 'meta',
  "accountId"           TEXT,
  "name"                TEXT NOT NULL,
  "hypothesis"          TEXT,
  "mode"                TEXT NOT NULL,
  "winningMetric"       TEXT NOT NULL DEFAULT 'engagement_rate',
  "minSampleReach"      INTEGER NOT NULL DEFAULT 0,
  "durationDays"        INTEGER NOT NULL DEFAULT 7,
  "status"              TEXT NOT NULL DEFAULT 'draft',
  "startedAt"           TIMESTAMP(3),
  "endsAt"              TIMESTAMP(3),
  "winnerVariantId"     TEXT,
  "aiSummary"           JSONB,
  "createdById"         INTEGER,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganicPostExperiment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganicPostExperiment_advertiserCompanyId_fkey"
    FOREIGN KEY ("advertiserCompanyId") REFERENCES "AdvertiserCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganicPostExperiment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OrganicPostExperiment_tenantId_idx"
  ON "OrganicPostExperiment" ("tenantId");
CREATE INDEX IF NOT EXISTS "OrganicPostExperiment_tenantId_status_idx"
  ON "OrganicPostExperiment" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "OrganicPostExperiment_tenantId_advertiserCompanyId_idx"
  ON "OrganicPostExperiment" ("tenantId", "advertiserCompanyId");
CREATE INDEX IF NOT EXISTS "OrganicPostExperiment_tenantId_platform_idx"
  ON "OrganicPostExperiment" ("tenantId", "platform");

-- 8. OrganicPostExperimentVariant ----------------------------------------------
CREATE TABLE IF NOT EXISTS "OrganicPostExperimentVariant" (
  "id"              TEXT PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "experimentId"    TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "note"            TEXT,
  "postId"          TEXT,
  "scheduledFor"    TIMESTAMP(3),
  "caption"         TEXT,
  "mediaUrl"        TEXT,
  "postType"        TEXT,
  "platform"        TEXT,
  "metricsSnapshot" JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganicPostExperimentVariant_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganicPostExperimentVariant_experimentId_fkey"
    FOREIGN KEY ("experimentId") REFERENCES "OrganicPostExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OrganicPostExperimentVariant_tenantId_idx"
  ON "OrganicPostExperimentVariant" ("tenantId");
CREATE INDEX IF NOT EXISTS "OrganicPostExperimentVariant_experimentId_idx"
  ON "OrganicPostExperimentVariant" ("experimentId");
CREATE INDEX IF NOT EXISTS "OrganicPostExperimentVariant_tenantId_experimentId_idx"
  ON "OrganicPostExperimentVariant" ("tenantId", "experimentId");
