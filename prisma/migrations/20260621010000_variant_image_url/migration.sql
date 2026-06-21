-- Optional per-variant photo. Additive and non-destructive: existing variants get a
-- NULL imageUrl and keep working (they fall back to the product image when needed).
ALTER TABLE "menu_item_variants" ADD COLUMN "imageUrl" TEXT;
