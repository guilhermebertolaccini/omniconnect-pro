-- Sprint 1.2 — ModelPricing
-- Versioned price catalog replacing the AI_PRICING constant in
-- insight-ai.service. Lookup by (provider, model, at) honours the
-- effectiveFrom/effectiveUntil window. Initial rows match the previous
-- constant exactly (gpt-4o, gpt-4o-mini), priced per 1k tokens in USD.

CREATE TABLE IF NOT EXISTS "ModelPricing" (
    "id"             SERIAL       NOT NULL,
    "modelProvider"  TEXT         NOT NULL,
    "modelName"      TEXT         NOT NULL,
    "inputPer1k"     DOUBLE PRECISION NOT NULL,
    "outputPer1k"    DOUBLE PRECISION NOT NULL,
    "currency"       TEXT         NOT NULL DEFAULT 'USD',
    "effectiveFrom"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPricing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ModelPricing_modelProvider_modelName_idx"
  ON "ModelPricing"("modelProvider", "modelName");
CREATE INDEX IF NOT EXISTS "ModelPricing_modelProvider_modelName_effectiveFrom_idx"
  ON "ModelPricing"("modelProvider", "modelName", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "ModelPricing_modelProvider_modelName_effectiveUntil_idx"
  ON "ModelPricing"("modelProvider", "modelName", "effectiveUntil");

-- Initial seed mirroring the previous hard-coded constant.
INSERT INTO "ModelPricing" ("modelProvider", "modelName", "inputPer1k", "outputPer1k", "currency", "notes", "updatedAt")
VALUES
    ('openai', 'gpt-4o-mini', 0.00015, 0.0006, 'USD', 'sprint-1.2 seed (migrated from AI_PRICING constant)', CURRENT_TIMESTAMP),
    ('openai', 'gpt-4o',      0.0025,  0.01,   'USD', 'sprint-1.2 seed (migrated from AI_PRICING constant)', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
