CREATE TABLE "menu_item_extras" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "menu_item_extras_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "menu_item_extras_menuItemId_idx" ON "menu_item_extras"("menuItemId");

ALTER TABLE "menu_item_extras" ADD CONSTRAINT "menu_item_extras_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
