-- Allow order_items and order_draft_items to keep their snapshot data
-- even when the referenced menu item is deleted (e.g. during menu replace import).
-- Name/price are already snapshotted so the FK is informational only.

ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_menuItemId_fkey";
ALTER TABLE "order_items" ALTER COLUMN "menuItemId" DROP NOT NULL;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_draft_items" DROP CONSTRAINT IF EXISTS "order_draft_items_menuItemId_fkey";
ALTER TABLE "order_draft_items" ALTER COLUMN "menuItemId" DROP NOT NULL;
ALTER TABLE "order_draft_items" ADD CONSTRAINT "order_draft_items_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
