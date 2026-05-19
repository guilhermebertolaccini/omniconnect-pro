-- Botify handoff triage snapshot (optional JSON); other queue sources leave null.
ALTER TABLE "MessageQueue" ADD COLUMN "leadSummary" JSONB;
