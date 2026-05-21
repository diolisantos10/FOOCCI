-- Add emergency ordering pause fields to restaurants table
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "isOrderingPaused"     BOOLEAN   NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "orderingPausedReason" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "orderingPausedAt"     TIMESTAMP(3);
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "orderingPausedUntil"  TIMESTAMP(3);
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "orderingPausedBy"     TEXT;
