-- AddColumn: brandPersona Json? to restaurant_brand_configs
ALTER TABLE "restaurant_brand_configs" ADD COLUMN IF NOT EXISTS "brandPersona" JSONB;
