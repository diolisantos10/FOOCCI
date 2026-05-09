-- Repair migration: fix column names to match Prisma camelCase field names.
--
-- Background: migration 20260509010000_crm_campaign_v2 was authored with snake_case
-- column names but Prisma expects camelCase (no @map decorators on these fields).
-- The CREATE INDEX on campaigns("restaurant_id", "status") caused that migration to
-- fail on production because the campaigns table has "restaurantId", not "restaurant_id".
-- The start script marks 20260509010000 as rolled-back before migrate deploy runs,
-- so this migration handles the actual schema changes for existing environments.
--
-- On fresh DBs: 20260509010000 now has the correct SQL, so the ADD COLUMN IF NOT EXISTS
-- lines below are no-ops — safe to run either way.

-- whatsapp_agent_configs: rename agent_mode → agentMode
-- (added as snake_case by 20260509000000_whatsapp_agent_mode which succeeded)
ALTER TABLE "whatsapp_agent_configs" RENAME COLUMN "agent_mode" TO "agentMode";

-- campaigns: add camelCase columns
ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "objective"      TEXT,
  ADD COLUMN IF NOT EXISTS "channel"        TEXT NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN IF NOT EXISTS "targetSegment"  TEXT,
  ADD COLUMN IF NOT EXISTS "templateId"     TEXT,
  ADD COLUMN IF NOT EXISTS "totalAudience"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalFailed"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalResponded" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "campaigns_restaurantId_status_idx" ON "campaigns"("restaurantId", "status");

-- campaign_executions: add camelCase columns
ALTER TABLE "campaign_executions"
  ADD COLUMN IF NOT EXISTS "restaurantId"   TEXT,
  ADD COLUMN IF NOT EXISTS "customerName"   TEXT,
  ADD COLUMN IF NOT EXISTS "customerPhone"  TEXT,
  ADD COLUMN IF NOT EXISTS "messageText"    TEXT,
  ADD COLUMN IF NOT EXISTS "failedReason"   TEXT;

CREATE INDEX IF NOT EXISTS "campaign_executions_restaurantId_idx" ON "campaign_executions"("restaurantId");
