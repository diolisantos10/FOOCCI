-- Migration: no-phone CRM customers
--
-- 1. Allow phone to be NULL (no-phone imported customers have no real phone)
--    PostgreSQL NULL values are NOT considered equal in unique indexes,
--    so the existing UNIQUE(phone, restaurantId) constraint continues to
--    allow multiple NULL-phone rows per restaurant — exactly what we need.
--
-- 2. Add contactability and import-tracking columns.

ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;

ALTER TABLE "customers" ADD COLUMN "crmContactable"       BOOLEAN  NOT NULL DEFAULT true;
ALTER TABLE "customers" ADD COLUMN "contactStatus"        TEXT;
ALTER TABLE "customers" ADD COLUMN "importExternalId"     TEXT;
ALTER TABLE "customers" ADD COLUMN "sourceSystem"         TEXT;
ALTER TABLE "customers" ADD COLUMN "dataEnrichmentStatus" TEXT;

-- Back-fill existing rows so they are all CONTACTABLE (they all have a phone)
UPDATE "customers" SET "contactStatus" = 'CONTACTABLE' WHERE "phone" IS NOT NULL;

CREATE INDEX "customers_crmContactable_idx" ON "customers"("restaurantId", "crmContactable");
