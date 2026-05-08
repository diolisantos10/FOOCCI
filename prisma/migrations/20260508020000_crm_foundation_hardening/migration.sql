-- CRM Foundation Hardening
-- Adds persisted tier/segment to Customer, source/importedAt to Order,
-- and category/variant/addon snapshot fields to OrderItem.

-- ── Customer: persisted tier and segment ─────────────────────────────────────

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tier"    TEXT NOT NULL DEFAULT 'BRONZE';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "segment" TEXT NOT NULL DEFAULT 'SEM_PEDIDOS';

-- Backfill tier from current totalSpend
UPDATE "customers"
SET "tier" = CASE
  WHEN CAST("totalSpend" AS NUMERIC) >= 2000 THEN 'DIAMANTE'
  WHEN CAST("totalSpend" AS NUMERIC) >= 800  THEN 'OURO'
  WHEN CAST("totalSpend" AS NUMERIC) >= 300  THEN 'PRATA'
  ELSE 'BRONZE'
END;

-- Backfill segment from current lastOrderAt
UPDATE "customers"
SET "segment" = CASE
  WHEN "lastOrderAt" IS NULL THEN 'SEM_PEDIDOS'
  WHEN "lastOrderAt" >= NOW() - INTERVAL '30 days' THEN 'QUENTE'
  WHEN "lastOrderAt" >= NOW() - INTERVAL '60 days' THEN 'MORNO'
  ELSE 'FRIO'
END;

-- ── Order: source channel and import timestamp ────────────────────────────────

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source"     TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP(3);

-- ── OrderItem: category, variant and addon snapshots ─────────────────────────

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "categoryId"   TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "categoryName" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "variantName"  TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "addonsJson"   JSONB;

-- Create index on categoryId for analytics queries
CREATE INDEX IF NOT EXISTS "order_items_categoryId_idx" ON "order_items"("categoryId");

-- Backfill categoryId and categoryName from MenuItem → MenuCategory
-- Only fills rows where menuItemId is set and category can be resolved.
-- Rows with null menuItemId (deleted products) remain null — name snapshot still present.
UPDATE "order_items" oi
SET
  "categoryId"   = mc."id",
  "categoryName" = mc."name"
FROM "menu_items" mi
JOIN "menu_categories" mc ON mc."id" = mi."categoryId"
WHERE oi."menuItemId" = mi."id"
  AND oi."categoryId" IS NULL;
