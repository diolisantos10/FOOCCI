-- Campaign: add objective, channel, targetSegment, templateId, totalAudience, totalFailed, totalResponded
ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "objective"      TEXT,
  ADD COLUMN IF NOT EXISTS "channel"        TEXT NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN IF NOT EXISTS "targetSegment"  TEXT,
  ADD COLUMN IF NOT EXISTS "templateId"     TEXT,
  ADD COLUMN IF NOT EXISTS "totalAudience"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalFailed"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalResponded" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "campaigns_restaurantId_status_idx" ON "campaigns"("restaurantId", "status");

-- CampaignExecution: add restaurantId, customerName, customerPhone, messageText, failedReason
ALTER TABLE "campaign_executions"
  ADD COLUMN IF NOT EXISTS "restaurantId"   TEXT,
  ADD COLUMN IF NOT EXISTS "customerName"   TEXT,
  ADD COLUMN IF NOT EXISTS "customerPhone"  TEXT,
  ADD COLUMN IF NOT EXISTS "messageText"    TEXT,
  ADD COLUMN IF NOT EXISTS "failedReason"   TEXT;

CREATE INDEX IF NOT EXISTS "campaign_executions_restaurantId_idx" ON "campaign_executions"("restaurantId");
