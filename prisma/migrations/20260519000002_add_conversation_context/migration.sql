-- AddColumn: contextType and relatedCampaignId to conversations
-- Nullable, no FK constraint — safe ADD COLUMN with no downtime on Postgres.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "contextType"       TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "relatedCampaignId" TEXT;
