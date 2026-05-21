-- Add segmentConfig to RestaurantCRMProfile
-- Non-destructive: nullable column, no default required, no data migration needed.

ALTER TABLE "restaurant_crm_profiles"
  ADD COLUMN IF NOT EXISTS "segmentConfig" JSONB;
