-- ════════════════════════════════════════════════════════════════════════════
--  WhatsApp Text Ordering — durable session state. Additive only: one new table
--  holding the in-progress WhatsApp order-taking session per restaurant+phone.
--  Behind feature flag/allowlist; not written from production webhook paths in
--  the default DRY_RUN_ONLY mode. No existing table is altered.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "whatsapp_ordering_sessions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "conversationId" TEXT,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "stage" TEXT NOT NULL DEFAULT 'IDLE',
    "selectedItems" JSONB NOT NULL DEFAULT '[]',
    "unresolvedItems" JSONB NOT NULL DEFAULT '[]',
    "missingQuestions" JSONB NOT NULL DEFAULT '[]',
    "deliveryType" TEXT,
    "address" JSONB,
    "deliveryQuote" JSONB,
    "paymentMethod" TEXT,
    "paymentStatus" TEXT,
    "orderDraftId" TEXT,
    "orderId" TEXT,
    "pixPaymentId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'DRY_RUN_ONLY',
    "source" TEXT NOT NULL DEFAULT 'admin_test',
    "metadata" JSONB,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_ordering_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_ordering_sessions_restaurantId_status_idx" ON "whatsapp_ordering_sessions"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "whatsapp_ordering_sessions_restaurantId_phone_status_idx" ON "whatsapp_ordering_sessions"("restaurantId", "phone", "status");

-- CreateIndex
CREATE INDEX "whatsapp_ordering_sessions_conversationId_idx" ON "whatsapp_ordering_sessions"("conversationId");

-- AddForeignKey
ALTER TABLE "whatsapp_ordering_sessions" ADD CONSTRAINT "whatsapp_ordering_sessions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
