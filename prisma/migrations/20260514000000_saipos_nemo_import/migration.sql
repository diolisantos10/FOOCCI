-- Add financialBalancePeriod to customers
ALTER TABLE "customers"
  ADD COLUMN "financialBalancePeriod" DECIMAL(10,2);

-- Create ProductSalesAggregate table
CREATE TABLE "product_sales_aggregates" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL DEFAULT 'SAIPOS',
  "periodStart"  TIMESTAMP(3) NOT NULL,
  "periodEnd"    TIMESTAMP(3) NOT NULL,
  "categoryName" TEXT NOT NULL,
  "productName"  TEXT,
  "quantitySold" INTEGER NOT NULL DEFAULT 0,
  "grossRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "percent"      DECIMAL(6,4),
  "rowType"      TEXT NOT NULL,
  "importKey"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_sales_aggregates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_sales_aggregates_importKey_key"
  ON "product_sales_aggregates"("importKey");

CREATE INDEX "product_sales_aggregates_restaurantId_idx"
  ON "product_sales_aggregates"("restaurantId");

ALTER TABLE "product_sales_aggregates"
  ADD CONSTRAINT "product_sales_aggregates_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
