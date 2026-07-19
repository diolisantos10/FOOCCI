-- CMV & Precificação (/precificacao)
-- Additive only — no existing rows are touched:
--   • menu_items.cost: unit cost (CMV por item), NULL until the lojista fills it
--   • restaurant_pricing_configs: markup assumptions + reprice device per restaurant
--   • price_change_logs: audit trail of every cost/price change (no FK to menu_items
--     on purpose — history must survive item deletion)

ALTER TABLE "menu_items" ADD COLUMN "cost" DECIMAL(10,2);

CREATE TYPE "AutoRepriceMode" AS ENUM ('OFF', 'SUGGEST', 'AUTO');
CREATE TYPE "PriceRounding" AS ENUM ('NONE', 'ENDING_90', 'ENDING_99');
CREATE TYPE "PriceChangeSource" AS ENUM ('MANUAL', 'APPLIED', 'AUTO', 'COST_EDIT');

CREATE TABLE "restaurant_pricing_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "monthlyRevenue" DECIMAL(12,2),
    "fixedExpensesMonthly" DECIMAL(12,2),
    "taxesFeesPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "targetProfitPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "autoRepriceMode" "AutoRepriceMode" NOT NULL DEFAULT 'SUGGEST',
    "rounding" "PriceRounding" NOT NULL DEFAULT 'ENDING_90',
    "maxAutoChangePct" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "periodOpeningStock" DECIMAL(12,2),
    "periodPurchases" DECIMAL(12,2),
    "periodClosingStock" DECIMAL(12,2),
    "periodRevenue" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_pricing_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_pricing_configs_restaurantId_key" ON "restaurant_pricing_configs"("restaurantId");

ALTER TABLE "restaurant_pricing_configs" ADD CONSTRAINT "restaurant_pricing_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "price_change_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "oldPrice" DECIMAL(10,2),
    "newPrice" DECIMAL(10,2),
    "oldCost" DECIMAL(10,2),
    "newCost" DECIMAL(10,2),
    "source" "PriceChangeSource" NOT NULL,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "price_change_logs_restaurantId_createdAt_idx" ON "price_change_logs"("restaurantId", "createdAt");
CREATE INDEX "price_change_logs_menuItemId_idx" ON "price_change_logs"("menuItemId");

ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
