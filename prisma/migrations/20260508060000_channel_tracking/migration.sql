-- Channel Tracking Foundation
-- TrackingLink model, Order attribution fields, GA4/GTM on brand config

-- ── New: tracking_links table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tracking_links" (
  "id"                      TEXT        NOT NULL,
  "restaurantId"            TEXT        NOT NULL,
  "name"                    TEXT        NOT NULL,
  "slug"                    TEXT        NOT NULL,
  "destinationType"         TEXT        NOT NULL DEFAULT 'PEDIDO',
  "source"                  TEXT        NOT NULL,
  "medium"                  TEXT        NOT NULL,
  "campaign"                TEXT,
  "content"                 TEXT,
  "term"                    TEXT,
  "isActive"                BOOLEAN     NOT NULL DEFAULT true,
  "clickCount"              INTEGER     NOT NULL DEFAULT 0,
  "identifiedCustomerCount" INTEGER     NOT NULL DEFAULT 0,
  "orderStartedCount"       INTEGER     NOT NULL DEFAULT 0,
  "orderCompletedCount"     INTEGER     NOT NULL DEFAULT 0,
  "revenue"                 DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tracking_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tracking_links_restaurantId_slug_key"
  ON "tracking_links"("restaurantId", "slug");

CREATE INDEX IF NOT EXISTS "tracking_links_restaurantId_idx"
  ON "tracking_links"("restaurantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tracking_links_restaurantId_fkey'
  ) THEN
    ALTER TABLE "tracking_links"
      ADD CONSTRAINT "tracking_links_restaurantId_fkey"
      FOREIGN KEY ("restaurantId")
      REFERENCES "restaurants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- ── Order attribution fields ─────────────────────────────────────────────────
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "trackingLinkId"  TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "trafficSource"   TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "trafficMedium"   TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "trafficCampaign" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "trafficContent"  TEXT;

-- ── GA4 / GTM fields on brand config ────────────────────────────────────────
ALTER TABLE "restaurant_brand_configs" ADD COLUMN IF NOT EXISTS "ga4MeasurementId" TEXT;
ALTER TABLE "restaurant_brand_configs" ADD COLUMN IF NOT EXISTS "gtmId"            TEXT;
