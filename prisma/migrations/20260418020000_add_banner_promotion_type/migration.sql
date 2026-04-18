-- Add BANNER to PromotionType enum and bannerImageUrl column

ALTER TYPE "PromotionType" ADD VALUE IF NOT EXISTS 'BANNER';

ALTER TABLE "promotions"
  ADD COLUMN IF NOT EXISTS "bannerImageUrl" TEXT;
