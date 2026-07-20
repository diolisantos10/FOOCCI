-- Aba Insumos (/precificacao): ingredient catalog + recipe lines (ficha técnica v1)
-- Additive only. quantity NULL on recipe_lines = imported link not yet quantified.
-- New PriceChangeSource RECIPE marks product costs recomputed from the ficha.

ALTER TYPE "PriceChangeSource" ADD VALUE 'RECIPE';

CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'un',
    "costPerUnit" DECIMAL(12,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingredients_restaurantId_name_key" ON "ingredients"("restaurantId", "name");
CREATE INDEX "ingredients_restaurantId_idx" ON "ingredients"("restaurantId");

ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "recipe_lines" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipe_lines_menuItemId_ingredientId_key" ON "recipe_lines"("menuItemId", "ingredientId");
CREATE INDEX "recipe_lines_ingredientId_idx" ON "recipe_lines"("ingredientId");

ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
