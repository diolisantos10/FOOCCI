-- Add readyMadeConfig to restaurant_crm_profiles.
-- Stores on/off state for ready-made campaign engines that are NOT backed by a
-- Campaign row (currently cart recovery). Additive, nullable, zero downtime.
ALTER TABLE "restaurant_crm_profiles" ADD COLUMN IF NOT EXISTS "readyMadeConfig" JSONB;
