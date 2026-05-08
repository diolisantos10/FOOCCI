-- Chat Inbox Foundation
-- Extends Conversation + Message models for AI agent conversations:
-- • WEB_AGENT / QR_AGENT channels
-- • AI_ATENDENDO / HUMANO_ASSUMIU statuses
-- • aiEnabled flag for human takeover
-- • sessionId for anonymous browser-session tracking
-- • Denormalized customerName/customerPhone for anonymous sessions
-- • senderType on Message (CUSTOMER | AI | HUMAN | SYSTEM)

-- ── Extend Channel enum ───────────────────────────────────────────────────────

ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'WEB_AGENT';
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'QR_AGENT';
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'MANUAL';

-- ── Extend ConversationStatus enum ───────────────────────────────────────────

ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'AI_ATENDENDO';
ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'HUMANO_ASSUMIU';

-- ── Make customerId nullable (anonymous web sessions have no customer yet) ───

ALTER TABLE "conversations" ALTER COLUMN "customerId" DROP NOT NULL;

-- ── New columns on conversations ──────────────────────────────────────────────

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "aiEnabled"     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "sessionId"     TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "customerName"  TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "orderId"       TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "orderDraftId"  TEXT;

-- ── New column on messages ────────────────────────────────────────────────────

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "senderType" TEXT;

-- ── New indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "conversations_sessionId_idx"      ON "conversations"("sessionId");
CREATE INDEX IF NOT EXISTS "conversations_customerPhone_idx"  ON "conversations"("customerPhone");
CREATE INDEX IF NOT EXISTS "conversations_channel_idx"        ON "conversations"("channel");
CREATE INDEX IF NOT EXISTS "conversations_aiEnabled_idx"      ON "conversations"("aiEnabled");
