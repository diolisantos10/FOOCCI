ALTER TABLE "restaurant_brand_configs"
  ADD COLUMN IF NOT EXISTS "googleReviewUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "ifoodReviewUrl"  TEXT;
