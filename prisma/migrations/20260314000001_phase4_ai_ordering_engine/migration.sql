-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4: AI Ordering Engine
-- Additive migration — safe to apply on top of 20260314000000_initial_schema.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable: ai_interaction_logs — add Phase 4 audit fields
ALTER TABLE "ai_interaction_logs"
  ADD COLUMN "turnNumber"       INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "toolCalls"        JSONB,
  ADD COLUMN "estimatedCostUsd" DECIMAL(10,6);

-- CreateTable: restaurant_brand_configs
CREATE TABLE "restaurant_brand_configs" (
    "id"                   TEXT         NOT NULL,
    "restaurantId"         TEXT         NOT NULL,
    "tone"                 TEXT         NOT NULL DEFAULT 'friendly',
    "formality"            TEXT         NOT NULL DEFAULT 'informal',
    "emojiUsage"           TEXT         NOT NULL DEFAULT 'moderate',
    "communicationStyle"   TEXT         NOT NULL DEFAULT 'conversational',
    "upsellStyle"          TEXT         NOT NULL DEFAULT 'gentle',
    "greetingTemplate"     TEXT,
    "systemPromptOverride" TEXT,
    "aiModel"              TEXT         NOT NULL DEFAULT 'gpt-4o-mini',
    "maxHistoryMessages"   INTEGER      NOT NULL DEFAULT 20,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_brand_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one config per restaurant
CREATE UNIQUE INDEX "restaurant_brand_configs_restaurantId_key"
  ON "restaurant_brand_configs"("restaurantId");

-- AddForeignKey
ALTER TABLE "restaurant_brand_configs"
  ADD CONSTRAINT "restaurant_brand_configs_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
