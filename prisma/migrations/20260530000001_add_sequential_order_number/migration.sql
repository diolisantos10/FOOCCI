-- Sequential, human-friendly per-restaurant order numbers.
--
-- 1. Add a monotonic counter to each restaurant.
-- 2. Add a nullable orderNumber to orders.
-- 3. Backfill existing orders per restaurant ordered by createdAt (then id for ties).
-- 4. Seed each restaurant's counter to its current max so new orders continue the sequence.
-- 5. Enforce uniqueness per restaurant.

-- 1. Per-restaurant counter
ALTER TABLE "restaurants" ADD COLUMN "lastOrderNumber" INTEGER NOT NULL DEFAULT 0;

-- 2. Order number (nullable — legacy rows are backfilled below; future rows are always set)
ALTER TABLE "orders" ADD COLUMN "orderNumber" INTEGER;

-- 3. Backfill existing orders: 1..N per restaurant in chronological order
WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "restaurantId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "orders"
)
UPDATE "orders" o
SET "orderNumber" = n.rn
FROM numbered n
WHERE o."id" = n."id";

-- 4. Seed each restaurant's counter to the highest assigned number
UPDATE "restaurants" r
SET "lastOrderNumber" = COALESCE(
  (SELECT MAX("orderNumber") FROM "orders" WHERE "restaurantId" = r."id"),
  0
);

-- 5. Uniqueness per restaurant (NULLs allowed and not considered equal in Postgres)
CREATE UNIQUE INDEX "orders_restaurantId_orderNumber_key" ON "orders"("restaurantId", "orderNumber");
