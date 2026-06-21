-- Meta WhatsApp provider — Phase 2 (additive, non-destructive).
-- Adds: optional provider fallback config on restaurants, provider-tracking columns
-- on messages, and an approved-template registry for Meta business-initiated sends.
-- Evolution behaviour is unchanged: all new columns are nullable or defaulted, and
-- existing rows keep working with the current external* fields.

-- Restaurant: optional, OFF-by-default provider fallback.
ALTER TABLE "restaurants" ADD COLUMN "allowWhatsAppProviderFallback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "fallbackProvider" TEXT NOT NULL DEFAULT 'EVOLUTION';

-- Message: dual-provider tracking (nullable; Evolution rows leave these null).
ALTER TABLE "messages" ADD COLUMN "provider" TEXT;
ALTER TABLE "messages" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "messages" ADD COLUMN "providerStatus" TEXT;
ALTER TABLE "messages" ADD COLUMN "providerError" TEXT;

-- Approved Meta template registry (Meta-only; empty for Evolution restaurants).
CREATE TABLE "meta_message_templates" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'pt_BR',
    "category" TEXT NOT NULL DEFAULT 'UTILITY',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bodyVariables" INTEGER NOT NULL DEFAULT 0,
    "mappedCampaignType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "meta_message_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_message_templates_restaurantId_templateName_languageCo_key"
    ON "meta_message_templates"("restaurantId", "templateName", "languageCode");
CREATE INDEX "meta_message_templates_restaurantId_status_idx"
    ON "meta_message_templates"("restaurantId", "status");

ALTER TABLE "meta_message_templates"
    ADD CONSTRAINT "meta_message_templates_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
