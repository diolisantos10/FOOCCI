-- Instagram Direct channel foundation (ADDITIVE ONLY).
-- Adds INSTAGRAM_DIRECT to the Channel enum, a channel-agnostic customer identity
-- table, and a per-restaurant Instagram connection config. Nothing here sends a
-- message, creates an order, generates a Pix, or touches existing rows.

-- 1) New channel value (idempotent).
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'INSTAGRAM_DIRECT';

-- 2) Customer channel identity — per-channel external user id (soft refs, no FK).
CREATE TABLE IF NOT EXISTS "customer_channel_identities" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "channel" "Channel" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "profilePictureUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_channel_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_channel_identities_restaurantId_channel_externalUserId_key"
    ON "customer_channel_identities" ("restaurantId", "channel", "externalUserId");
CREATE INDEX IF NOT EXISTS "customer_channel_identities_restaurantId_channel_idx"
    ON "customer_channel_identities" ("restaurantId", "channel");
CREATE INDEX IF NOT EXISTS "customer_channel_identities_customerId_idx"
    ON "customer_channel_identities" ("customerId");

-- 3) Instagram channel config — encrypted token, hashed verify token, mode/scope gates.
CREATE TABLE IF NOT EXISTS "instagram_channel_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'DISABLED',
    "scope" TEXT NOT NULL DEFAULT 'TEST_ACCOUNT_ONLY',
    "instagramBusinessAccountId" TEXT,
    "facebookPageId" TEXT,
    "pageAccessTokenEncrypted" TEXT,
    "verifyTokenHash" TEXT,
    "appId" TEXT,
    "appSecretRef" TEXT,
    "allowlistedExternalUserIds" JSONB NOT NULL DEFAULT '[]',
    "lastWebhookAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "instagram_channel_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "instagram_channel_configs_restaurantId_key"
    ON "instagram_channel_configs" ("restaurantId");
CREATE INDEX IF NOT EXISTS "instagram_channel_configs_facebookPageId_idx"
    ON "instagram_channel_configs" ("facebookPageId");
CREATE INDEX IF NOT EXISTS "instagram_channel_configs_instagramBusinessAccountId_idx"
    ON "instagram_channel_configs" ("instagramBusinessAccountId");
