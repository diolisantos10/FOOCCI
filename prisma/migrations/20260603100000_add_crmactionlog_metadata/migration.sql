-- AlterTable
-- Additive, nullable JSON column for structured CRM action context
-- (e.g. review-request platform/link/status). Backward-compatible: existing
-- rows remain NULL and existing inserts are unaffected.
ALTER TABLE "crm_action_logs" ADD COLUMN "metadata" JSONB;
