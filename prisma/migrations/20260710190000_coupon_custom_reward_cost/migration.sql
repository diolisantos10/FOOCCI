-- Custom reward (brinde) text + estimated cost for the monthly coupon budget. Additive.
ALTER TABLE "customer_coupons" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "customer_coupons" ADD COLUMN IF NOT EXISTS "costEstimate" DECIMAL(10,2);
