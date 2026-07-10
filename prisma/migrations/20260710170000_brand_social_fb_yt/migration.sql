-- Facebook + YouTube social links on the brand config (additive, nullable).
ALTER TABLE "restaurant_brand_configs" ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT;
ALTER TABLE "restaurant_brand_configs" ADD COLUMN IF NOT EXISTS "youtubeUrl" TEXT;
