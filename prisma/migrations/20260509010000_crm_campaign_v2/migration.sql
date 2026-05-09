-- Campaign: add objective, channel, targetSegment, templateId, totalAudience, totalFailed, totalResponded
ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "objective"      TEXT,
  ADD COLUMN IF NOT EXISTS "channel"        TEXT NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN IF NOT EXISTS "target_segment" TEXT,
  ADD COLUMN IF NOT EXISTS "template_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "total_audience" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_failed"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_responded" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "campaigns_restaurant_id_status_idx" ON "campaigns"("restaurant_id", "status");

-- CampaignExecution: add restaurantId, customerName, customerPhone, messageText, failedReason
ALTER TABLE "campaign_executions"
  ADD COLUMN IF NOT EXISTS "restaurant_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "customer_name"   TEXT,
  ADD COLUMN IF NOT EXISTS "customer_phone"  TEXT,
  ADD COLUMN IF NOT EXISTS "message_text"    TEXT,
  ADD COLUMN IF NOT EXISTS "failed_reason"   TEXT;

CREATE INDEX IF NOT EXISTS "campaign_executions_restaurant_id_idx" ON "campaign_executions"("restaurant_id");
