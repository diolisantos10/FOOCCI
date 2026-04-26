ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotencyKey_key" ON "orders"("idempotencyKey");
