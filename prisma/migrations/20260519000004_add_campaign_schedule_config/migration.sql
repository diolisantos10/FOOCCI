-- AddColumn: Campaign scheduling and audience config
-- All nullable — zero downtime on Postgres.

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "scheduleConfig" JSONB;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "audienceConfig"  JSONB;
