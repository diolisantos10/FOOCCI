-- Migration: customer_fields_expansion
-- Adds CPF/CNPJ, financial balance, and imported summary fields to customers.

ALTER TABLE "customers"
  ADD COLUMN "document"            TEXT,
  ADD COLUMN "financialBalance"    DECIMAL(10,2),
  ADD COLUMN "importedOrderCount"  INTEGER,
  ADD COLUMN "importedTotalSpent"  DECIMAL(10,2),
  ADD COLUMN "importedLastOrderAt" TIMESTAMP(3),
  ADD COLUMN "averageTicket"       DECIMAL(10,2);
