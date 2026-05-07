-- Migration: add_customer_is_guest
-- Adds isGuest flag to customers and retroactively marks all rows
-- whose phone matches the GUEST-{uuid} anonymous session pattern.

ALTER TABLE "customers" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- Retroactive: mark every existing anonymous-session customer.
-- These rows have phone values that start with 'GUEST-' followed by a UUID.
UPDATE "customers" SET "isGuest" = true WHERE phone LIKE 'GUEST-%';
