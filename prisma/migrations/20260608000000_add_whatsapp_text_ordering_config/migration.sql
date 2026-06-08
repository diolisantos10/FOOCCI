-- ════════════════════════════════════════════════════════════════════════════
--  WhatsApp Text Ordering — per-restaurant live activation config. Additive only:
--  one new table holding controlled-rollout activation per restaurant, replacing
--  the need to hand-edit Railway env vars. The global env kill switch always
--  overrides these rows. Default is fully OFF/safe. No existing table is altered.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "whatsapp_text_ordering_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'DRY_RUN_ONLY',
    "scope" TEXT NOT NULL DEFAULT 'PHONE_ALLOWLIST',
    "allowlistedPhones" JSONB NOT NULL DEFAULT '[]',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_text_ordering_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_text_ordering_configs_restaurantId_key" ON "whatsapp_text_ordering_configs"("restaurantId");

-- AddForeignKey
ALTER TABLE "whatsapp_text_ordering_configs" ADD CONSTRAINT "whatsapp_text_ordering_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
