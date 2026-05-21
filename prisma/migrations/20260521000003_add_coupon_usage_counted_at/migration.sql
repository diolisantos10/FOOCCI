-- Add couponUsageCountedAt to orders for idempotent Promotion.usedCount tracking
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "couponUsageCountedAt" TIMESTAMP(3);
