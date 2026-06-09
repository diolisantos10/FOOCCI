-- CRM contact governance: campaign identity + impact ledger (ADDITIVE ONLY).
-- No existing column dropped/retyped. The ledger has no FKs — deleting a campaign
-- or customer never erases impact memory. Nothing here sends or mutates a campaign.

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "campaignFamilyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "messageFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "dedupePolicy" JSONB;

CREATE INDEX IF NOT EXISTS "campaigns_restaurantId_campaignFamilyKey_idx" ON "campaigns" ("restaurantId", "campaignFamilyKey");

CREATE TABLE IF NOT EXISTS "crm_contact_ledger" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT,
    "campaignId" TEXT,
    "campaignFamilyKey" TEXT,
    "messageFingerprint" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "contactType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasonCode" TEXT,
    "usedPriorityOverride" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "sourceExecutionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_contact_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "crm_contact_ledger_restaurantId_customerId_idx" ON "crm_contact_ledger" ("restaurantId", "customerId");
CREATE INDEX IF NOT EXISTS "crm_contact_ledger_rest_family_customer_idx" ON "crm_contact_ledger" ("restaurantId", "campaignFamilyKey", "customerId");
CREATE INDEX IF NOT EXISTS "crm_contact_ledger_rest_fingerprint_customer_idx" ON "crm_contact_ledger" ("restaurantId", "messageFingerprint", "customerId");
CREATE INDEX IF NOT EXISTS "crm_contact_ledger_restaurantId_createdAt_idx" ON "crm_contact_ledger" ("restaurantId", "createdAt");
