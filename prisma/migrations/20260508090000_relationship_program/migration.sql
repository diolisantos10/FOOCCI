-- TierSettings: one row per restaurant, stores configurable tier thresholds
CREATE TABLE IF NOT EXISTS "tier_settings" (
  "id"               TEXT          NOT NULL,
  "restaurantId"     TEXT          NOT NULL,
  "silverMinSpend"   DECIMAL(10,2) NOT NULL DEFAULT 300,
  "silverMinOrders"  INTEGER       NOT NULL DEFAULT 0,
  "goldMinSpend"     DECIMAL(10,2) NOT NULL DEFAULT 800,
  "goldMinOrders"    INTEGER       NOT NULL DEFAULT 0,
  "diamondMinSpend"  DECIMAL(10,2) NOT NULL DEFAULT 2000,
  "diamondMinOrders" INTEGER       NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tier_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tier_settings_restaurantId_key"
  ON "tier_settings"("restaurantId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tier_settings_restaurantId_fkey'
  ) THEN
    ALTER TABLE "tier_settings"
      ADD CONSTRAINT "tier_settings_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- TierBenefit: custom benefits per tier per restaurant
CREATE TABLE IF NOT EXISTS "tier_benefits" (
  "id"           TEXT         NOT NULL,
  "restaurantId" TEXT         NOT NULL,
  "tier"         TEXT         NOT NULL,
  "title"        TEXT         NOT NULL,
  "description"  TEXT,
  "isActive"     BOOLEAN      NOT NULL DEFAULT true,
  "sortOrder"    INTEGER      NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tier_benefits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tier_benefits_restaurantId_tier_idx"
  ON "tier_benefits"("restaurantId", "tier");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tier_benefits_restaurantId_fkey'
  ) THEN
    ALTER TABLE "tier_benefits"
      ADD CONSTRAINT "tier_benefits_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
