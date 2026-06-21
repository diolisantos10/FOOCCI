-- Variant price becomes optional (inherits the parent product's price/channel price
-- when null). Non-destructive: existing variant prices are preserved; only the
-- NOT NULL constraint is dropped so a variant can be saved without a price.
ALTER TABLE "menu_item_variants" ALTER COLUMN "price" DROP NOT NULL;
