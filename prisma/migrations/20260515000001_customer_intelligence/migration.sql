-- Customer intelligence fields
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "dataCompletenessScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastEnrichmentAt"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "enrichmentNotes"        TEXT;

-- Set initial completeness scores for existing customers with phones
UPDATE "customers"
SET "dataCompletenessScore" = (
  CASE WHEN "phone"     IS NOT NULL AND "phone" NOT LIKE 'GUEST-%' THEN 20 ELSE 0 END +
  CASE WHEN "name"      IS NOT NULL AND LENGTH("name") > 1          THEN 15 ELSE 0 END +
  CASE WHEN "email"     IS NOT NULL                                  THEN 10 ELSE 0 END +
  CASE WHEN "document"  IS NOT NULL                                  THEN 10 ELSE 0 END +
  CASE WHEN "birthDate" IS NOT NULL                                  THEN  8 ELSE 0 END +
  CASE WHEN "totalOrders" > 0                                        THEN  7 ELSE 0 END
)
WHERE "isGuest" = false;

-- CustomerDataSignal table
CREATE TABLE "customer_data_signals" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "restaurantId" TEXT         NOT NULL,
  "customerId"   TEXT         NOT NULL,
  "type"         TEXT         NOT NULL,
  "field"        TEXT,
  "value"        TEXT,
  "confidence"   DOUBLE PRECISION,
  "source"       TEXT         NOT NULL,
  "status"       TEXT         NOT NULL DEFAULT 'INFERRED',
  "notes"        TEXT,
  "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "reviewedAt"   TIMESTAMPTZ,

  CONSTRAINT "customer_data_signals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "customer_data_signals"
  ADD CONSTRAINT "customer_data_signals_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_data_signals_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE;

CREATE INDEX "customer_data_signals_customerId_idx"   ON "customer_data_signals"("customerId");
CREATE INDEX "customer_data_signals_restaurantId_idx" ON "customer_data_signals"("restaurantId", "status");
