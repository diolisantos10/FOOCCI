-- ── Add distance-based delivery mode fields to delivery_configs ──────────────

ALTER TABLE "delivery_configs"
  ADD COLUMN "distanceBaseFee"      DECIMAL(10,2),
  ADD COLUMN "distancePricePerKm"   DECIMAL(10,2),
  ADD COLUMN "distanceMaxKm"        DOUBLE PRECISION,
  ADD COLUMN "distanceMinFee"       DECIMAL(10,2),
  ADD COLUMN "distanceMaxFee"       DECIMAL(10,2),
  ADD COLUMN "distanceEstimatedBase" INTEGER;
