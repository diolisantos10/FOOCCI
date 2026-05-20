-- CreateTable: restaurant_knowledge_items
-- Stores FAQ entries and operational facts the WhatsApp Agent uses to answer
-- customers. Items must be ACTIVE (approved by owner) before the agent uses them.

CREATE TABLE "restaurant_knowledge_items" (
    "id"                          TEXT NOT NULL,
    "restaurantId"                TEXT NOT NULL,
    "title"                       TEXT NOT NULL,
    "category"                    TEXT NOT NULL,
    "questionPatterns"            JSONB NOT NULL,
    "answer"                      TEXT NOT NULL DEFAULT '',
    "status"                      TEXT NOT NULL DEFAULT 'SUGGESTED',
    "source"                      TEXT NOT NULL,
    "confidence"                  DOUBLE PRECISION,
    "createdFromConversationId"   TEXT,
    "createdFromMessageIds"       JSONB,
    "usageCount"                  INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt"                  TIMESTAMP(3),
    "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "restaurant_knowledge_items_restaurantId_idx"          ON "restaurant_knowledge_items"("restaurantId");
CREATE INDEX "restaurant_knowledge_items_restaurantId_status_idx"   ON "restaurant_knowledge_items"("restaurantId", "status");
CREATE INDEX "restaurant_knowledge_items_restaurantId_category_idx" ON "restaurant_knowledge_items"("restaurantId", "category");

-- AddForeignKey
ALTER TABLE "restaurant_knowledge_items"
    ADD CONSTRAINT "restaurant_knowledge_items_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
