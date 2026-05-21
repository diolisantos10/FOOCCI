-- Add coupon tracking fields to orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promotionId" TEXT;
