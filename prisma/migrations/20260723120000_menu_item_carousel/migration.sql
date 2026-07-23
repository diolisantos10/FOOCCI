-- Multi-photo carousel for menu items (opt-in per item).
-- Additive, defaulted columns → safe on existing rows, no backfill, no downtime.
-- imageUrl stays the single cover; `images` is the extra carousel set for the detail sheet.
ALTER TABLE "menu_items" ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "menu_items" ADD COLUMN "carouselEnabled" BOOLEAN NOT NULL DEFAULT false;
