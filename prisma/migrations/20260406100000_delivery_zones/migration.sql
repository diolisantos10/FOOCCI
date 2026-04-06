-- ── Extend DeliveryConfig with commercial rules + phase hooks ─────────────────

ALTER TABLE "delivery_configs"
  ADD COLUMN "pickupEnabled"     BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN "mode"              TEXT         NOT NULL DEFAULT 'simple',
  ADD COLUMN "minOrderValue"     DECIMAL(10,2),
  ADD COLUMN "freeDeliveryAbove" DECIMAL(10,2),
  ADD COLUMN "peakHoursEnabled"  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN "peakHoursConfig"   TEXT,
  ADD COLUMN "geoCenter"         TEXT,
  ADD COLUMN "geoRadiusKm"       DOUBLE PRECISION;

-- ── Create delivery_zones table ────────────────────────────────────────────────

CREATE TABLE "delivery_zones" (
    "id"               TEXT         NOT NULL,
    "restaurantId"     TEXT         NOT NULL,
    "name"             TEXT         NOT NULL,
    "sortOrder"        INTEGER      NOT NULL DEFAULT 0,
    "maxDistanceKm"    DOUBLE PRECISION NOT NULL,
    "fee"              DECIMAL(10,2) NOT NULL,
    "estimatedMinutes" INTEGER      NOT NULL,
    "minOrderValue"    DECIMAL(10,2),
    "isActive"         BOOLEAN      NOT NULL DEFAULT true,
    "peakFee"          DECIMAL(10,2),
    "geoPolygon"       TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_zones_restaurantId_sortOrder_idx"
    ON "delivery_zones"("restaurantId", "sortOrder");

ALTER TABLE "delivery_zones"
    ADD CONSTRAINT "delivery_zones_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
