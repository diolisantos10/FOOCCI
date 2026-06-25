-- Real-order printing via the Carteiro (station routing).
-- Order gains a once-only guard so each order enqueues its print jobs a single
-- time; PrintJob gains the source order for traceability/dedupe.

ALTER TABLE "orders" ADD COLUMN "printQueuedAt" TIMESTAMP(3);

ALTER TABLE "print_jobs" ADD COLUMN "orderId" TEXT;

CREATE INDEX "print_jobs_orderId_idx" ON "print_jobs"("orderId");
