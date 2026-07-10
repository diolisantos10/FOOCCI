-- Card-defined coupons: the wallet entry carries its own discount, no Promotion needed.
-- Make promotionId nullable and add self-contained discount fields. Additive.
ALTER TABLE "customer_coupons" ALTER COLUMN "promotionId" DROP NOT NULL;
ALTER TABLE "customer_coupons" ADD COLUMN IF NOT EXISTS "discountType" TEXT;
ALTER TABLE "customer_coupons" ADD COLUMN IF NOT EXISTS "discountValue" DECIMAL(10,2);

-- Drop the old strict FK and re-add it as ON DELETE SET NULL (promotion optional).
DO $$ BEGIN
  ALTER TABLE "customer_coupons" DROP CONSTRAINT "customer_coupons_promotionId_fkey";
EXCEPTION WHEN undefined_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_promotionId_fkey"
    FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
