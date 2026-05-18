-- Sprint 5 — ModelPricing rows for Anthropic + Google (Gemini) defaults used by InsightAI.
-- Approximate list USD per 1k tokens; adjust via admin/DB as vendors change pricing.

INSERT INTO "ModelPricing" ("modelProvider", "modelName", "inputPer1k", "outputPer1k", "currency", "notes", "updatedAt")
SELECT 'anthropic', 'claude-3-5-haiku-20241022', 0.0008, 0.004, 'USD', 'sprint-5 seed (approx public list)', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "ModelPricing" WHERE "modelProvider" = 'anthropic' AND "modelName" = 'claude-3-5-haiku-20241022'
);

INSERT INTO "ModelPricing" ("modelProvider", "modelName", "inputPer1k", "outputPer1k", "currency", "notes", "updatedAt")
SELECT 'anthropic', 'claude-3-5-sonnet-20241022', 0.003, 0.015, 'USD', 'sprint-5 seed (approx public list)', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "ModelPricing" WHERE "modelProvider" = 'anthropic' AND "modelName" = 'claude-3-5-sonnet-20241022'
);

INSERT INTO "ModelPricing" ("modelProvider", "modelName", "inputPer1k", "outputPer1k", "currency", "notes", "updatedAt")
SELECT 'google', 'gemini-2.0-flash', 0.0001, 0.0004, 'USD', 'sprint-5 seed (approx public list)', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "ModelPricing" WHERE "modelProvider" = 'google' AND "modelName" = 'gemini-2.0-flash'
);

INSERT INTO "ModelPricing" ("modelProvider", "modelName", "inputPer1k", "outputPer1k", "currency", "notes", "updatedAt")
SELECT 'google', 'gemini-1.5-flash', 0.000075, 0.0003, 'USD', 'sprint-5 seed (approx public list)', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "ModelPricing" WHERE "modelProvider" = 'google' AND "modelName" = 'gemini-1.5-flash'
);
