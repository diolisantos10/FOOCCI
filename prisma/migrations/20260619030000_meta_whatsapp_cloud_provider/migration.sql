-- Meta WhatsApp Cloud API as a parallel provider (additive, non-destructive).
-- Evolution stays the default; existing restaurants are unaffected.

-- Per-restaurant provider selection.
ALTER TABLE "restaurants" ADD COLUMN "whatsappProvider" TEXT NOT NULL DEFAULT 'EVOLUTION';

-- Secure per-restaurant Meta credentials/assets (token columns hold AES-256-GCM ciphertext).
CREATE TABLE "meta_whatsapp_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "businessId" TEXT,
    "configId" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "webhookVerifyToken" TEXT NOT NULL,
    "connectionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastHealthCheckAt" TIMESTAMP(3),
    "lastError" TEXT,
    "qualityRating" TEXT,
    "messagingLimit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_whatsapp_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_whatsapp_configs_restaurantId_key" ON "meta_whatsapp_configs"("restaurantId");
CREATE UNIQUE INDEX "meta_whatsapp_configs_phoneNumberId_key" ON "meta_whatsapp_configs"("phoneNumberId");
CREATE INDEX "meta_whatsapp_configs_phoneNumberId_idx" ON "meta_whatsapp_configs"("phoneNumberId");

ALTER TABLE "meta_whatsapp_configs" ADD CONSTRAINT "meta_whatsapp_configs_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
