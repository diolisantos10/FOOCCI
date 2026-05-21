-- Add whatsAppSafetyConfig to restaurant_crm_profiles.
-- Stores global CRM WhatsApp sending safety rules (daily cap, quiet hours, random delay, etc.)
-- Additive, nullable, zero downtime.
ALTER TABLE "restaurant_crm_profiles" ADD COLUMN IF NOT EXISTS "whatsAppSafetyConfig" JSONB;
