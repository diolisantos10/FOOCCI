-- Add scheduleConfig to crm_automations for per-automation timing configuration.
-- Stores: { sendTime?, sendDays?, timezone? }
-- Additive, nullable, zero downtime.
ALTER TABLE "crm_automations" ADD COLUMN IF NOT EXISTS "scheduleConfig" JSONB;
