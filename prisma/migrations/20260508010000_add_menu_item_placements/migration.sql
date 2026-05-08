-- Migration: add_menu_item_placements
-- Allows a single MenuItem to appear in multiple MenuCategories
-- without duplicating data. The primary category remains categoryId
-- on menu_items; additional appearances use this junction table.

CREATE TABLE "menu_item_placements" (
  "id"         TEXT NOT NULL,
  "itemId"     TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "menu_item_placements_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "menu_item_placements_itemId_fkey"      FOREIGN KEY ("itemId")     REFERENCES "menu_items"("id")       ON DELETE CASCADE,
  CONSTRAINT "menu_item_placements_categoryId_fkey"  FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id")  ON DELETE CASCADE,
  CONSTRAINT "menu_item_placements_itemId_categoryId_key" UNIQUE ("itemId", "categoryId")
);

CREATE INDEX "menu_item_placements_categoryId_idx" ON "menu_item_placements"("categoryId");
