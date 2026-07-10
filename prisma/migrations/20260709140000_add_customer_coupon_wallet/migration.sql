-- Customer coupon wallet (iFood-style). Coupons earned via CRM campaigns accumulate
-- per customer and are redeemed in the cart. Additive, zero downtime.

ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "couponValidityDays" INTEGER;

DO $$ BEGIN
  CREATE TYPE "CustomerCouponStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "customer_coupons" (
  "id"               TEXT NOT NULL,
  "restaurantId"     TEXT NOT NULL,
  "customerId"       TEXT NOT NULL,
  "promotionId"      TEXT NOT NULL,
  "couponCode"       TEXT NOT NULL,
  "status"           "CustomerCouponStatus" NOT NULL DEFAULT 'ACTIVE',
  "grantedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"        TIMESTAMP(3),
  "sourceCampaignId" TEXT,
  "usedAt"           TIMESTAMP(3),
  "usedOrderId"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_coupons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_coupons_customerId_status_idx" ON "customer_coupons"("customerId", "status");
CREATE INDEX IF NOT EXISTS "customer_coupons_restaurantId_idx" ON "customer_coupons"("restaurantId");

DO $$ BEGIN
  ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_promotionId_fkey"
    FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
