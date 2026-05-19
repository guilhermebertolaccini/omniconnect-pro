-- Sprint 3 — CRM Imobiliário backend migration
--
-- Importa o domínio do crm-imobiliario (originalmente Supabase) para o
-- omniconnect-backend, mantendo todos os invariantes multi-tenant e LGPD da
-- plataforma. Decisões fechadas (vide docs/migration/06-next-actions.md):
--
--   * Dados em produção: do_zero (não importamos do Supabase).
--   * Tenancy: multi_tenant_full — cada agência/imobiliária = Tenant.
--   * Roles: enum Role ganha 'broker'.
--   * Triggers: híbrido — audit no app layer (SystemEvent /
--     CrmChangeHistory); geração de Payments+Commissions on-signed
--     fica em trigger SQL (atomicidade transacional crítica).
--   * Storage de PDFs: filesystem local (vide BLOCO D — não cria tabelas).
--
-- Multi-tenant invariants:
--   * Toda tabela CRM carrega tenantId NOT NULL e FK -> Tenant ON DELETE
--     CASCADE.
--   * Índice por (tenantId, ...) em todas as queries comuns.
--   * Unique composto tenant-aware onde colisões poderiam vazar dados.
--
-- Idempotente em reruns parciais (CREATE TYPE / TABLE / INDEX IF NOT
-- EXISTS via DO blocks).

-- 0. Role enum: adiciona 'broker' --------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'broker' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'broker';
  END IF;
END$$;

-- 1. Novos enums do CRM -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmUnitStatus') THEN
    CREATE TYPE "CrmUnitStatus" AS ENUM ('available', 'reserved', 'sold');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmClientScore') THEN
    CREATE TYPE "CrmClientScore" AS ENUM ('A', 'B', 'C', 'D');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmLeadStage') THEN
    CREATE TYPE "CrmLeadStage" AS ENUM (
      'new', 'contacted', 'qualified', 'proposal', 'negotiation',
      'visit', 'won', 'lost', 'closed_won', 'closed_lost'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmInteractionType') THEN
    CREATE TYPE "CrmInteractionType" AS ENUM (
      'call', 'email', 'whatsapp', 'meeting', 'note', 'visit'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmProposalStatus') THEN
    CREATE TYPE "CrmProposalStatus" AS ENUM ('draft', 'sent', 'accepted', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmContractStatus') THEN
    CREATE TYPE "CrmContractStatus" AS ENUM (
      'draft', 'review', 'pending_signature', 'signed'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmPaymentType') THEN
    CREATE TYPE "CrmPaymentType" AS ENUM ('signal', 'installment', 'balloon');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmPaymentStatus') THEN
    CREATE TYPE "CrmPaymentStatus" AS ENUM ('pending', 'paid', 'overdue');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmCommissionStatus') THEN
    CREATE TYPE "CrmCommissionStatus" AS ENUM ('pending', 'paid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmDocumentParentType') THEN
    CREATE TYPE "CrmDocumentParentType" AS ENUM ('proposal', 'contract');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmDocumentVersionAction') THEN
    CREATE TYPE "CrmDocumentVersionAction" AS ENUM (
      'attached', 'replaced', 'generated', 'imported'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmDocumentAccessAction') THEN
    CREATE TYPE "CrmDocumentAccessAction" AS ENUM ('viewed', 'downloaded');
  END IF;
END$$;

-- 2. CrmProperty --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmProperty" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "address"     TEXT NOT NULL,
  "city"        TEXT NOT NULL,
  "developer"   TEXT,
  "imageUrl"    TEXT,
  "towers"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "documents"   JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdById" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmProperty_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmProperty_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmProperty_tenantId_idx" ON "CrmProperty" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmProperty_tenantId_name_idx" ON "CrmProperty" ("tenantId", "name");

-- 3. CrmUnit -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmUnit" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "propertyId"        TEXT NOT NULL,
  "number"            TEXT NOT NULL,
  "tower"             TEXT,
  "typology"          TEXT,
  "floor"             INTEGER,
  "area"              DECIMAL(12, 2),
  "price"             DECIMAL(14, 2),
  "status"            "CrmUnitStatus" NOT NULL DEFAULT 'available',
  "observations"      TEXT,
  "clientId"          TEXT,
  "reservedAt"        TIMESTAMP(3),
  "reservationExpiry" TIMESTAMP(3),
  "proposalId"        TEXT,
  "contractId"        TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmUnit_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmUnit_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "CrmProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmUnit_tenantId_propertyId_number_key"
  ON "CrmUnit" ("tenantId", "propertyId", "number");
CREATE INDEX IF NOT EXISTS "CrmUnit_tenantId_idx" ON "CrmUnit" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmUnit_tenantId_propertyId_idx" ON "CrmUnit" ("tenantId", "propertyId");
CREATE INDEX IF NOT EXISTS "CrmUnit_tenantId_status_idx" ON "CrmUnit" ("tenantId", "status");

-- 4. CrmCommissionConfig ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmCommissionConfig" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "propertyId"        TEXT NOT NULL,
  "commissionPercent" DECIMAL(5, 2) NOT NULL DEFAULT 5,
  "updatedById"       INTEGER,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmCommissionConfig_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmCommissionConfig_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "CrmProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmCommissionConfig_propertyId_key"
  ON "CrmCommissionConfig" ("propertyId");
CREATE INDEX IF NOT EXISTS "CrmCommissionConfig_tenantId_idx" ON "CrmCommissionConfig" ("tenantId");

-- 5. CrmClient ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmClient" (
  "id"        TEXT PRIMARY KEY,
  "tenantId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "cpfCnpj"   TEXT,
  "phone"     TEXT,
  "email"     TEXT,
  "income"    DECIMAL(14, 2),
  "score"     "CrmClientScore",
  "notes"     TEXT,
  "brokerId"  INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmClient_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmClient_brokerId_fkey"
    FOREIGN KEY ("brokerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmClient_tenantId_idx" ON "CrmClient" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmClient_tenantId_brokerId_idx" ON "CrmClient" ("tenantId", "brokerId");
CREATE INDEX IF NOT EXISTS "CrmClient_tenantId_cpfCnpj_idx" ON "CrmClient" ("tenantId", "cpfCnpj");

-- 6. CrmLead ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmLead" (
  "id"               TEXT PRIMARY KEY,
  "tenantId"         TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "email"            TEXT,
  "phone"            TEXT,
  "source"           TEXT,
  "stage"            "CrmLeadStage" NOT NULL DEFAULT 'new',
  "brokerId"         INTEGER,
  "brokerName"       TEXT,
  "propertyId"       TEXT,
  "clientId"         TEXT,
  "propertyInterest" TEXT,
  "estimatedValue"   DECIMAL(14, 2),
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmLead_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmLead_brokerId_fkey"
    FOREIGN KEY ("brokerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CrmLead_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "CrmProperty"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmLead_tenantId_idx" ON "CrmLead" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmLead_tenantId_stage_idx" ON "CrmLead" ("tenantId", "stage");
CREATE INDEX IF NOT EXISTS "CrmLead_tenantId_brokerId_idx" ON "CrmLead" ("tenantId", "brokerId");
CREATE INDEX IF NOT EXISTS "CrmLead_tenantId_clientId_idx" ON "CrmLead" ("tenantId", "clientId");

-- 7. CrmInteraction -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmInteraction" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "leadId"      TEXT NOT NULL,
  "type"        "CrmInteractionType" NOT NULL,
  "content"     TEXT,
  "createdById" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmInteraction_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmInteraction_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmInteraction_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmInteraction_tenantId_idx" ON "CrmInteraction" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmInteraction_tenantId_leadId_idx" ON "CrmInteraction" ("tenantId", "leadId");

-- 8. CrmFollowUp --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmFollowUp" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "leadId"      TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "title"       TEXT,
  "notes"       TEXT,
  "completedAt" TIMESTAMP(3),
  "createdById" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmFollowUp_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmFollowUp_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmFollowUp_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmFollowUp_tenantId_idx" ON "CrmFollowUp" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmFollowUp_tenantId_leadId_idx" ON "CrmFollowUp" ("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS "CrmFollowUp_tenantId_status_idx" ON "CrmFollowUp" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CrmFollowUp_tenantId_scheduledAt_idx" ON "CrmFollowUp" ("tenantId", "scheduledAt");

-- 9. CrmProposal --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmProposal" (
  "id"               TEXT PRIMARY KEY,
  "tenantId"         TEXT NOT NULL,
  "propertyId"       TEXT NOT NULL,
  "unitId"           TEXT NOT NULL,
  "clientId"         TEXT NOT NULL,
  "brokerId"         INTEGER NOT NULL,
  "propertyName"     TEXT NOT NULL,
  "unitNumber"       TEXT NOT NULL,
  "clientName"       TEXT NOT NULL,
  "brokerName"       TEXT,
  "originalPrice"    DECIMAL(14, 2),
  "discount"         DECIMAL(14, 2),
  "discountPercent"  DECIMAL(6, 2),
  "finalPrice"       DECIMAL(14, 2),
  "paymentCondition" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status"           "CrmProposalStatus" NOT NULL DEFAULT 'draft',
  "validUntil"       TIMESTAMP(3),
  "pdfUrl"           TEXT,
  "sourcePdfUrl"     TEXT,
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmProposal_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmProposal_brokerId_fkey"
    FOREIGN KEY ("brokerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmProposal_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "CrmProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmProposal_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "CrmUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmProposal_tenantId_idx" ON "CrmProposal" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmProposal_tenantId_status_idx" ON "CrmProposal" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CrmProposal_tenantId_brokerId_idx" ON "CrmProposal" ("tenantId", "brokerId");
CREATE INDEX IF NOT EXISTS "CrmProposal_tenantId_unitId_idx" ON "CrmProposal" ("tenantId", "unitId");
CREATE INDEX IF NOT EXISTS "CrmProposal_tenantId_clientId_idx" ON "CrmProposal" ("tenantId", "clientId");

-- 10. CrmProposalEvent --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmProposalEvent" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "proposalId"  TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "fromStatus"  TEXT,
  "toStatus"    TEXT,
  "message"     TEXT,
  "createdById" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmProposalEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmProposalEvent_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "CrmProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmProposalEvent_tenantId_idx" ON "CrmProposalEvent" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmProposalEvent_tenantId_proposalId_idx" ON "CrmProposalEvent" ("tenantId", "proposalId");

-- 11. CrmContract -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmContract" (
  "id"                  TEXT PRIMARY KEY,
  "tenantId"            TEXT NOT NULL,
  "proposalId"          TEXT,
  "propertyId"          TEXT NOT NULL,
  "unitId"              TEXT NOT NULL,
  "clientId"            TEXT NOT NULL,
  "brokerId"            INTEGER NOT NULL,
  "propertyName"        TEXT NOT NULL,
  "unitNumber"          TEXT NOT NULL,
  "clientName"          TEXT NOT NULL,
  "clientCpfCnpj"       TEXT,
  "brokerName"          TEXT,
  "finalPrice"          DECIMAL(14, 2),
  "paymentCondition"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status"              "CrmContractStatus" NOT NULL DEFAULT 'draft',
  "signatures"          JSONB NOT NULL DEFAULT '[]'::jsonb,
  "pdfUrl"              TEXT,
  "sourcePdfUrl"        TEXT,
  "notes"               TEXT,
  "externalEnvelopeId"  TEXT,
  "externalProvider"    TEXT,
  "externalEnvelopeUrl" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmContract_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmContract_brokerId_fkey"
    FOREIGN KEY ("brokerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmContract_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "CrmProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CrmContract_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "CrmProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmContract_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "CrmUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmContract_tenantId_idx" ON "CrmContract" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmContract_tenantId_status_idx" ON "CrmContract" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CrmContract_tenantId_brokerId_idx" ON "CrmContract" ("tenantId", "brokerId");
CREATE INDEX IF NOT EXISTS "CrmContract_tenantId_unitId_idx" ON "CrmContract" ("tenantId", "unitId");
CREATE INDEX IF NOT EXISTS "CrmContract_externalEnvelopeId_idx" ON "CrmContract" ("externalEnvelopeId");

-- 12. CrmContractEvent --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmContractEvent" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "contractId"  TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "fromStatus"  TEXT,
  "toStatus"    TEXT,
  "message"     TEXT,
  "createdById" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmContractEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmContractEvent_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "CrmContract"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmContractEvent_tenantId_idx" ON "CrmContractEvent" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmContractEvent_tenantId_contractId_idx" ON "CrmContractEvent" ("tenantId", "contractId");

-- 13. CrmSignature ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmSignature" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "contractId"    TEXT NOT NULL,
  "role"          TEXT NOT NULL,
  "signerName"    TEXT,
  "signerEmail"   TEXT,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "token"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "signedAt"      TIMESTAMP(3),
  "ipAddress"     TEXT,
  "signatureHash" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmSignature_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmSignature_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "CrmContract"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmSignature_contractId_role_key"
  ON "CrmSignature" ("contractId", "role");
CREATE INDEX IF NOT EXISTS "CrmSignature_tenantId_idx" ON "CrmSignature" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmSignature_tenantId_contractId_idx" ON "CrmSignature" ("tenantId", "contractId");
CREATE INDEX IF NOT EXISTS "CrmSignature_token_idx" ON "CrmSignature" ("token");

-- 14. CrmPayment --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmPayment" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "contractId"        TEXT NOT NULL,
  "propertyId"        TEXT NOT NULL,
  "unitId"            TEXT NOT NULL,
  "clientId"          TEXT NOT NULL,
  "propertyName"      TEXT NOT NULL,
  "unitNumber"        TEXT NOT NULL,
  "clientName"        TEXT NOT NULL,
  "type"              "CrmPaymentType" NOT NULL,
  "installmentNumber" INTEGER,
  "amount"            DECIMAL(14, 2),
  "dueDate"           TIMESTAMP(3),
  "paidAt"            TIMESTAMP(3),
  "status"            "CrmPaymentStatus" NOT NULL DEFAULT 'pending',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmPayment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmPayment_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "CrmContract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmPayment_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "CrmProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmPayment_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "CrmUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmPayment_tenantId_idx" ON "CrmPayment" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmPayment_tenantId_status_idx" ON "CrmPayment" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CrmPayment_tenantId_contractId_idx" ON "CrmPayment" ("tenantId", "contractId");
CREATE INDEX IF NOT EXISTS "CrmPayment_tenantId_dueDate_idx" ON "CrmPayment" ("tenantId", "dueDate");

-- 15. CrmCommission -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmCommission" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "contractId"        TEXT NOT NULL,
  "propertyId"        TEXT NOT NULL,
  "unitId"            TEXT NOT NULL,
  "brokerId"          INTEGER NOT NULL,
  "propertyName"      TEXT NOT NULL,
  "unitNumber"        TEXT NOT NULL,
  "brokerName"        TEXT,
  "salePrice"         DECIMAL(14, 2),
  "commissionPercent" DECIMAL(6, 2),
  "commissionValue"   DECIMAL(14, 2),
  "status"            "CrmCommissionStatus" NOT NULL DEFAULT 'pending',
  "paidAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmCommission_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmCommission_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "CrmContract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmCommission_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "CrmProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmCommission_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "CrmUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmCommission_brokerId_fkey"
    FOREIGN KEY ("brokerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmCommission_tenantId_idx" ON "CrmCommission" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmCommission_tenantId_status_idx" ON "CrmCommission" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CrmCommission_tenantId_contractId_idx" ON "CrmCommission" ("tenantId", "contractId");
CREATE INDEX IF NOT EXISTS "CrmCommission_tenantId_brokerId_idx" ON "CrmCommission" ("tenantId", "brokerId");

-- 16. CrmDocumentVersion ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmDocumentVersion" (
  "id"           TEXT PRIMARY KEY,
  "tenantId"     TEXT NOT NULL,
  "parentType"   "CrmDocumentParentType" NOT NULL,
  "parentId"     TEXT NOT NULL,
  "pdfUrl"       TEXT NOT NULL,
  "fileName"     TEXT,
  "action"       "CrmDocumentVersionAction" NOT NULL,
  "uploadedById" INTEGER,
  "uploaderName" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmDocumentVersion_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmDocumentVersion_tenantId_idx" ON "CrmDocumentVersion" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmDocumentVersion_tenantId_parentType_parentId_idx"
  ON "CrmDocumentVersion" ("tenantId", "parentType", "parentId");

-- 17. CrmDocumentAccessLog ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmDocumentAccessLog" (
  "id"         TEXT PRIMARY KEY,
  "tenantId"   TEXT NOT NULL,
  "parentType" "CrmDocumentParentType" NOT NULL,
  "parentId"   TEXT NOT NULL,
  "pdfUrl"     TEXT NOT NULL,
  "action"     "CrmDocumentAccessAction" NOT NULL,
  "userId"     INTEGER,
  "userName"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmDocumentAccessLog_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmDocumentAccessLog_tenantId_idx" ON "CrmDocumentAccessLog" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmDocumentAccessLog_tenantId_parentType_parentId_idx"
  ON "CrmDocumentAccessLog" ("tenantId", "parentType", "parentId");
CREATE INDEX IF NOT EXISTS "CrmDocumentAccessLog_tenantId_userId_idx"
  ON "CrmDocumentAccessLog" ("tenantId", "userId");

-- 18. CrmChangeHistory --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmChangeHistory" (
  "id"         TEXT PRIMARY KEY,
  "tenantId"   TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId"   TEXT NOT NULL,
  "field"      TEXT NOT NULL,
  "oldValue"   TEXT,
  "newValue"   TEXT,
  "userId"     INTEGER,
  "userName"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmChangeHistory_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmChangeHistory_tenantId_idx" ON "CrmChangeHistory" ("tenantId");
CREATE INDEX IF NOT EXISTS "CrmChangeHistory_tenantId_entityType_entityId_idx"
  ON "CrmChangeHistory" ("tenantId", "entityType", "entityId");

-- 19. CrmNotificationPreference -----------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmNotificationPreference" (
  "id"                       TEXT PRIMARY KEY,
  "tenantId"                 TEXT NOT NULL,
  "userId"                   INTEGER NOT NULL,
  "proposalSent"             BOOLEAN NOT NULL DEFAULT true,
  "contractPendingSignature" BOOLEAN NOT NULL DEFAULT true,
  "paymentDueSoon"           BOOLEAN NOT NULL DEFAULT true,
  "paymentOverdue"           BOOLEAN NOT NULL DEFAULT true,
  "commissionPaid"           BOOLEAN NOT NULL DEFAULT true,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmNotificationPreference_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmNotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmNotificationPreference_tenantId_userId_key"
  ON "CrmNotificationPreference" ("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "CrmNotificationPreference_tenantId_idx" ON "CrmNotificationPreference" ("tenantId");

-- 20. Trigger: gerar CrmPayment + CrmCommission quando CrmContract.status='signed'
--
-- Disparado AFTER UPDATE OF status quando o status transita PARA 'signed'
-- (transição NULL/qualquer -> signed). Idempotente: usa um INSERT que
-- ignora colisões via ON CONFLICT em (tenantId, contractId, installmentNumber)
-- para Payment e (tenantId, contractId, brokerId) para Commission — não
-- queremos múltiplas inserções se a transição rolar duas vezes por algum
-- bug de upstream.
--
-- A função lê `paymentCondition.installments` como JSONB array. Cada item
-- esperado em `{ amount, dueDate, type }`. Se vier vazio/null, gera só a
-- comissão. CommissionConfig por property tem precedência sobre o default
-- de 5%.

-- Unique necessária para o ON CONFLICT do trigger:
CREATE UNIQUE INDEX IF NOT EXISTS "CrmPayment_tenantId_contractId_installmentNumber_key"
  ON "CrmPayment" ("tenantId", "contractId", "installmentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "CrmCommission_tenantId_contractId_brokerId_key"
  ON "CrmCommission" ("tenantId", "contractId", "brokerId");

CREATE OR REPLACE FUNCTION crm_generate_financials_on_signed()
RETURNS TRIGGER AS $$
DECLARE
  installments_json JSONB;
  installment JSONB;
  idx INTEGER := 1;
  commission_pct NUMERIC(6, 2);
  installment_type TEXT;
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') THEN
    -- Comissão: respeita CrmCommissionConfig, fallback 5%.
    SELECT COALESCE(cc."commissionPercent", 5)
      INTO commission_pct
      FROM "CrmCommissionConfig" cc
     WHERE cc."propertyId" = NEW."propertyId"
       AND cc."tenantId"   = NEW."tenantId"
     LIMIT 1;

    IF commission_pct IS NULL THEN
      commission_pct := 5;
    END IF;

    INSERT INTO "CrmCommission" (
      "id", "tenantId", "contractId", "propertyId", "unitId",
      "brokerId", "propertyName", "unitNumber", "brokerName",
      "salePrice", "commissionPercent", "commissionValue",
      "status", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid()::text, NEW."tenantId", NEW."id",
      NEW."propertyId", NEW."unitId", NEW."brokerId",
      NEW."propertyName", NEW."unitNumber", NEW."brokerName",
      NEW."finalPrice", commission_pct,
      COALESCE(NEW."finalPrice", 0) * commission_pct / 100,
      'pending', NOW(), NOW()
    )
    ON CONFLICT ("tenantId", "contractId", "brokerId") DO NOTHING;

    -- Payments: lê paymentCondition.installments se existir.
    installments_json := NEW."paymentCondition" -> 'installments';
    IF installments_json IS NOT NULL AND jsonb_typeof(installments_json) = 'array' THEN
      FOR installment IN SELECT * FROM jsonb_array_elements(installments_json) LOOP
        installment_type := COALESCE(installment ->> 'type', 'installment');
        INSERT INTO "CrmPayment" (
          "id", "tenantId", "contractId", "propertyId", "unitId", "clientId",
          "propertyName", "unitNumber", "clientName",
          "type", "installmentNumber", "amount", "dueDate",
          "status", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text, NEW."tenantId", NEW."id",
          NEW."propertyId", NEW."unitId", NEW."clientId",
          NEW."propertyName", NEW."unitNumber", NEW."clientName",
          installment_type::"CrmPaymentType", idx,
          NULLIF(installment ->> 'amount', '')::DECIMAL(14, 2),
          NULLIF(installment ->> 'dueDate', '')::TIMESTAMP(3),
          'pending', NOW(), NOW()
        )
        ON CONFLICT ("tenantId", "contractId", "installmentNumber") DO NOTHING;
        idx := idx + 1;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_generate_financials_on_signed ON "CrmContract";
CREATE TRIGGER trg_crm_generate_financials_on_signed
  AFTER UPDATE OF "status" ON "CrmContract"
  FOR EACH ROW
  EXECUTE FUNCTION crm_generate_financials_on_signed();
