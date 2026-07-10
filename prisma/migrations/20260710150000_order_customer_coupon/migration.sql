-- Wallet coupon redeemed on an order (marked USED on payment approval / order create).
-- Additive, nullable, zero downtime.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerCouponId" TEXT;
