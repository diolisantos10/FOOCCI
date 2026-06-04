-- ════════════════════════════════════════════════════════════════════════════
--  P0 OPERACIONAL — two independent, additive, backwards-compatible changes:
--
--  A) Staff/Supplier conversation lock
--     A persistent classification (conversationType) + a permanent AI lock
--     (aiLocked) on conversations. When locked, the AI never replies
--     automatically and is not re-enabled by any auto-return rule — only an
--     explicit manual unlock restores it. Existing conversations default to
--     CUSTOMER / aiLocked=false → unchanged behavior.
--
--  B) Channel-based menu pricing
--     Nullable per-channel price columns on menu_items and menu_item_variants.
--     NULL = fall back to the base `price`. Existing products keep working.
-- ════════════════════════════════════════════════════════════════════════════

-- ── A) Conversation classification + AI lock ────────────────────────────────

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('CUSTOMER', 'STAFF', 'SUPPLIER', 'PARTNER', 'INTERNAL', 'OTHER_NON_CUSTOMER');

-- AlterTable
ALTER TABLE "conversations"
  ADD COLUMN "conversationType" "ConversationType" NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN "aiLocked"         BOOLEAN            NOT NULL DEFAULT false,
  ADD COLUMN "aiLockedReason"   TEXT,
  ADD COLUMN "aiLockedAt"       TIMESTAMP(3),
  ADD COLUMN "aiLockedByUserId" TEXT;

-- Helps the Atendimento filters that surface locked / non-customer conversations.
CREATE INDEX "conversations_restaurantId_aiLocked_idx" ON "conversations"("restaurantId", "aiLocked");
CREATE INDEX "conversations_restaurantId_conversationType_idx" ON "conversations"("restaurantId", "conversationType");

-- ── B) Channel-based pricing ────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "menu_items"
  ADD COLUMN "priceDelivery" DECIMAL(10,2),
  ADD COLUMN "priceDineIn"   DECIMAL(10,2),
  ADD COLUMN "priceIfood"    DECIMAL(10,2);

-- AlterTable
ALTER TABLE "menu_item_variants"
  ADD COLUMN "priceDelivery" DECIMAL(10,2),
  ADD COLUMN "priceDineIn"   DECIMAL(10,2),
  ADD COLUMN "priceIfood"    DECIMAL(10,2);
