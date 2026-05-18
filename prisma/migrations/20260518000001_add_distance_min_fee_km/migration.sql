-- AlterTable: add distanceMinFeeKm to delivery_configs (IF NOT EXISTS makes this idempotent)
ALTER TABLE "delivery_configs" ADD COLUMN IF NOT EXISTS "distanceMinFeeKm" DOUBLE PRECISION;
