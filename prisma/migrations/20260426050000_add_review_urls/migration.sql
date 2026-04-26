-- Add Google and iFood review URL fields to brand config
ALTER TABLE "restaurant_brand_configs" ADD COLUMN IF NOT EXISTS "googleReviewUrl" TEXT;
ALTER TABLE "restaurant_brand_configs" ADD COLUMN IF NOT EXISTS "ifoodReviewUrl" TEXT;
