-- Migration: saipos_integration
-- Adds Saipos POS integration fields to orders, menu items, variants, extras,
-- and option group items.

-- ── Orders: Saipos sync tracking ────────────────────────────────────────────────
ALTER TABLE "orders" ADD COLUMN "saiposSentAt"  TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "saiposOrderId" TEXT;
ALTER TABLE "orders" ADD COLUMN "saiposStatus"  TEXT;
ALTER TABLE "orders" ADD COLUMN "saiposError"   TEXT;

-- ── Menu items: PDV integration code ────────────────────────────────────────────
ALTER TABLE "menu_items"         ADD COLUMN "saiposIntegrationCode" TEXT;
ALTER TABLE "menu_item_variants" ADD COLUMN "saiposIntegrationCode" TEXT;
ALTER TABLE "menu_item_extras"   ADD COLUMN "saiposIntegrationCode" TEXT;
ALTER TABLE "option_group_items" ADD COLUMN "saiposIntegrationCode" TEXT;
