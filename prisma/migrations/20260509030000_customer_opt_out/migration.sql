-- AddColumn: Customer.hasOptedOut + optOutAt (LGPD compliance)
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "hasOptedOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "optOutAt"    TIMESTAMP(3);

-- Index for fast opt-out audience exclusion
CREATE INDEX IF NOT EXISTS "customers_restaurantId_hasOptedOut_idx"
  ON "customers"("restaurantId", "hasOptedOut");
