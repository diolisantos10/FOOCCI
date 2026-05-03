-- AddColumn: Order.crmSyncedAt
-- Idempotency sentinel: set once customer metrics have been counted for this order.
-- NULL = not yet synced. Non-NULL = synced at that timestamp (never sync again).
ALTER TABLE "orders" ADD COLUMN "crmSyncedAt" TIMESTAMP(3);
