-- Transparent card (SumUp) result metadata on a payment.
--   installments: parcelas (1 = à vista)
--   cardBrand / cardLast4: for the cashier ticket / receipt
-- All nullable & additive — existing Pix/cash rows keep NULL. Non-blocking on Postgres.
ALTER TABLE "payments" ADD COLUMN "installments" INTEGER;
ALTER TABLE "payments" ADD COLUMN "cardBrand" TEXT;
ALTER TABLE "payments" ADD COLUMN "cardLast4" TEXT;
