-- ─────────────────────────────────────────────────────────────────────────────
-- Consolidated initial schema  (Phases 1–4)
-- Replaces the two previous migration files which had an incorrect FK
-- column name on menu_items (used "menuItemId" instead of "categoryId").
--
-- Ordering: enums → tables (dependency order) → indexes → foreign keys
-- Apply with: prisma migrate deploy
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "Plan"               AS ENUM ('STARTER', 'GROWTH', 'PRO');
CREATE TYPE "Role"               AS ENUM ('OWNER', 'MANAGER', 'STAFF');
CREATE TYPE "OrderDraftStatus"   AS ENUM ('OPEN', 'CONFIRMED', 'ABANDONED');
CREATE TYPE "FulfillmentType"    AS ENUM ('DELIVERY', 'PICKUP', 'DINE_IN');
CREATE TYPE "OrderStatus"        AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
CREATE TYPE "OrderType"          AS ENUM ('DELIVERY', 'PICKUP', 'DINE_IN');
CREATE TYPE "PaymentMethod"      AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'ONLINE');
CREATE TYPE "PaymentStatus"      AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE "Channel"            AS ENUM ('WHATSAPP', 'EMAIL', 'SMS');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'BOT', 'HUMAN', 'RESOLVED');
CREATE TYPE "Direction"          AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MessageType"        AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'DOCUMENT', 'TEMPLATE', 'INTERACTIVE');
CREATE TYPE "CampaignStatus"     AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');
CREATE TYPE "ExecutionStatus"    AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');
CREATE TYPE "OfferType"          AS ENUM ('PERCENTAGE', 'FIXED', 'FREE_DELIVERY');

-- ── Tables (dependency order — no forward FK references) ─────────────────────

CREATE TABLE "restaurants" (
    "id"        TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "slug"      TEXT         NOT NULL,
    "phone"     TEXT,
    "email"     TEXT,
    "logoUrl"   TEXT,
    "address"   TEXT,
    "timezone"  TEXT         NOT NULL DEFAULT 'America/Sao_Paulo',
    "isActive"  BOOLEAN      NOT NULL DEFAULT true,
    "plan"      "Plan"       NOT NULL DEFAULT 'STARTER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id"           TEXT         NOT NULL,
    "restaurantId" TEXT         NOT NULL,
    "name"         TEXT         NOT NULL,
    "email"        TEXT         NOT NULL,
    "password"     TEXT         NOT NULL,
    "role"         "Role"       NOT NULL DEFAULT 'STAFF',
    "isActive"     BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customers" (
    "id"           TEXT         NOT NULL,
    "restaurantId" TEXT         NOT NULL,
    "name"         TEXT         NOT NULL,
    "phone"        TEXT         NOT NULL,
    "email"        TEXT,
    "birthDate"    TIMESTAMP(3),
    "notes"        TEXT,
    "totalOrders"  INTEGER      NOT NULL DEFAULT 0,
    "totalSpend"   DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lastOrderAt"  TIMESTAMP(3),
    "isActive"     BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "addresses" (
    "id"           TEXT         NOT NULL,
    "customerId"   TEXT         NOT NULL,
    "label"        TEXT,
    "street"       TEXT         NOT NULL,
    "number"       TEXT         NOT NULL,
    "complement"   TEXT,
    "neighborhood" TEXT         NOT NULL,
    "city"         TEXT         NOT NULL,
    "state"        TEXT         NOT NULL,
    "zipCode"      TEXT         NOT NULL,
    "isDefault"    BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_preferences" (
    "id"           TEXT         NOT NULL,
    "customerId"   TEXT         NOT NULL,
    "dietary"      TEXT[]       NOT NULL DEFAULT '{}',
    "allergies"    TEXT[]       NOT NULL DEFAULT '{}',
    "favoriteDish" TEXT,
    "notes"        TEXT,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_categories" (
    "id"           TEXT         NOT NULL,
    "restaurantId" TEXT         NOT NULL,
    "name"         TEXT         NOT NULL,
    "description"  TEXT,
    "imageUrl"     TEXT,
    "sortOrder"    INTEGER      NOT NULL DEFAULT 0,
    "isActive"     BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_items" (
    "id"          TEXT          NOT NULL,
    "categoryId"  TEXT          NOT NULL,
    "name"        TEXT          NOT NULL,
    "description" TEXT,
    "price"       DECIMAL(10,2) NOT NULL,
    "imageUrl"    TEXT,
    "sortOrder"   INTEGER       NOT NULL DEFAULT 0,
    "isActive"    BOOLEAN       NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_segments" (
    "id"           TEXT         NOT NULL,
    "restaurantId" TEXT         NOT NULL,
    "name"         TEXT         NOT NULL,
    "description"  TEXT,
    "filters"      JSONB        NOT NULL,
    "memberCount"  INTEGER      NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_drafts" (
    "id"                TEXT             NOT NULL,
    "restaurantId"      TEXT             NOT NULL,
    "customerId"        TEXT             NOT NULL,
    "conversationId"    TEXT,
    "status"            "OrderDraftStatus" NOT NULL DEFAULT 'OPEN',
    "fulfillmentType"   "FulfillmentType"  NOT NULL DEFAULT 'DELIVERY',
    "deliveryAddressId" TEXT,
    "subtotal"          DECIMAL(10,2)    NOT NULL DEFAULT 0,
    "deliveryFee"       DECIMAL(10,2)    NOT NULL DEFAULT 0,
    "totalAmount"       DECIMAL(10,2)    NOT NULL DEFAULT 0,
    "notes"             TEXT,
    "aiSummary"         TEXT,
    "confirmedAt"       TIMESTAMP(3),
    "abandonedAt"       TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "order_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_draft_items" (
    "id"           TEXT          NOT NULL,
    "orderDraftId" TEXT          NOT NULL,
    "menuItemId"   TEXT          NOT NULL,
    "quantity"     INTEGER       NOT NULL,
    "unitPrice"    DECIMAL(10,2) NOT NULL,
    "isUpsell"     BOOLEAN       NOT NULL DEFAULT false,
    "notes"        TEXT,
    "addedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_draft_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id"                TEXT          NOT NULL,
    "restaurantId"      TEXT          NOT NULL,
    "customerId"        TEXT          NOT NULL,
    "orderDraftId"      TEXT,
    "status"            "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "type"              "OrderType"   NOT NULL DEFAULT 'DELIVERY',
    "subtotal"          DECIMAL(10,2) NOT NULL,
    "deliveryFee"       DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount"          DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total"             DECIMAL(10,2) NOT NULL,
    "notes"             TEXT,
    "deliveryAddressId" TEXT,
    "estimatedAt"       TIMESTAMP(3),
    "completedAt"       TIMESTAMP(3),
    "cancelledAt"       TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
    "id"         TEXT          NOT NULL,
    "orderId"    TEXT          NOT NULL,
    "menuItemId" TEXT          NOT NULL,
    "name"       TEXT          NOT NULL,
    "price"      DECIMAL(10,2) NOT NULL,
    "quantity"   INTEGER       NOT NULL,
    "notes"      TEXT,
    "total"      DECIMAL(10,2) NOT NULL,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id"        TEXT            NOT NULL,
    "orderId"   TEXT            NOT NULL,
    "method"    "PaymentMethod" NOT NULL,
    "status"    "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount"    DECIMAL(10,2)   NOT NULL,
    "paidAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversations" (
    "id"            TEXT                NOT NULL,
    "restaurantId"  TEXT                NOT NULL,
    "customerId"    TEXT                NOT NULL,
    "channel"       "Channel"           NOT NULL DEFAULT 'WHATSAPP',
    "status"        "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTo"    TEXT,
    "resolvedAt"    TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount"   INTEGER             NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)        NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id"                TEXT          NOT NULL,
    "conversationId"    TEXT          NOT NULL,
    "direction"         "Direction"   NOT NULL DEFAULT 'INBOUND',
    "content"           TEXT          NOT NULL,
    "type"              "MessageType" NOT NULL DEFAULT 'TEXT',
    "mediaUrl"          TEXT,
    "isRead"            BOOLEAN       NOT NULL DEFAULT false,
    "sentAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt"       TIMESTAMP(3),
    "readAt"            TIMESTAMP(3),
    "errorMessage"      TEXT,
    "metadata"          JSONB,
    "externalMessageId" TEXT,
    "externalStatus"    TEXT,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
    "id"           TEXT             NOT NULL,
    "restaurantId" TEXT             NOT NULL,
    "name"         TEXT             NOT NULL,
    "message"      TEXT             NOT NULL,
    "segmentId"    TEXT,
    "scheduledAt"  TIMESTAMP(3),
    "sentAt"       TIMESTAMP(3),
    "status"       "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "totalSent"    INTEGER          NOT NULL DEFAULT 0,
    "totalRead"    INTEGER          NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_executions" (
    "id"           TEXT              NOT NULL,
    "campaignId"   TEXT              NOT NULL,
    "customerId"   TEXT              NOT NULL,
    "status"       "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt"       TIMESTAMP(3),
    "readAt"       TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt"    TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_segment_memberships" (
    "segmentId"  TEXT         NOT NULL,
    "customerId" TEXT         NOT NULL,
    "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_segment_memberships_pkey" PRIMARY KEY ("segmentId", "customerId")
);

CREATE TABLE "offers" (
    "id"            TEXT          NOT NULL,
    "restaurantId"  TEXT          NOT NULL,
    "title"         TEXT          NOT NULL,
    "description"   TEXT,
    "discount"      DECIMAL(5,2)  NOT NULL,
    "type"          "OfferType"   NOT NULL,
    "code"          TEXT,
    "minOrderValue" DECIMAL(10,2),
    "maxUses"       INTEGER,
    "usedCount"     INTEGER       NOT NULL DEFAULT 0,
    "validFrom"     TIMESTAMP(3),
    "validUntil"    TIMESTAMP(3),
    "isActive"      BOOLEAN       NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- ai_interaction_logs includes Phase 4 columns (turnNumber, toolCalls, estimatedCostUsd)
CREATE TABLE "ai_interaction_logs" (
    "id"               TEXT          NOT NULL,
    "restaurantId"     TEXT          NOT NULL,
    "conversationId"   TEXT,
    "model"            TEXT          NOT NULL,
    "promptTokens"     INTEGER       NOT NULL DEFAULT 0,
    "completionTokens" INTEGER       NOT NULL DEFAULT 0,
    "totalTokens"      INTEGER       NOT NULL DEFAULT 0,
    "latencyMs"        INTEGER       NOT NULL DEFAULT 0,
    "success"          BOOLEAN       NOT NULL DEFAULT true,
    "errorMessage"     TEXT,
    "turnNumber"       INTEGER       NOT NULL DEFAULT 0,
    "toolCalls"        JSONB,
    "estimatedCostUsd" DECIMAL(10,6),
    "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_interaction_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evolution_configs" (
    "id"            TEXT         NOT NULL,
    "restaurantId"  TEXT         NOT NULL,
    "instanceName"  TEXT         NOT NULL,
    "baseUrl"       TEXT         NOT NULL,
    "apiKey"        TEXT         NOT NULL,
    "webhookSecret" TEXT         NOT NULL,
    "isActive"      BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "evolution_configs_pkey" PRIMARY KEY ("id")
);

-- Phase 4: per-restaurant AI brand voice config
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

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "restaurants_slug_key"                         ON "restaurants"("slug");
CREATE UNIQUE INDEX "users_email_restaurantId_key"                 ON "users"("email", "restaurantId");
CREATE INDEX        "users_restaurantId_idx"                       ON "users"("restaurantId");
CREATE UNIQUE INDEX "customers_phone_restaurantId_key"             ON "customers"("phone", "restaurantId");
CREATE INDEX        "customers_restaurantId_idx"                   ON "customers"("restaurantId");
CREATE INDEX        "addresses_customerId_idx"                     ON "addresses"("customerId");
CREATE UNIQUE INDEX "customer_preferences_customerId_key"          ON "customer_preferences"("customerId");
CREATE INDEX        "menu_categories_restaurantId_idx"             ON "menu_categories"("restaurantId");
CREATE INDEX        "menu_items_categoryId_idx"                    ON "menu_items"("categoryId");
CREATE INDEX        "customer_segments_restaurantId_idx"           ON "customer_segments"("restaurantId");
CREATE INDEX        "order_drafts_restaurantId_idx"                ON "order_drafts"("restaurantId");
CREATE INDEX        "order_drafts_customerId_idx"                  ON "order_drafts"("customerId");
CREATE INDEX        "order_drafts_restaurantId_status_idx"         ON "order_drafts"("restaurantId", "status");
CREATE INDEX        "order_draft_items_orderDraftId_idx"           ON "order_draft_items"("orderDraftId");
CREATE UNIQUE INDEX "orders_orderDraftId_key"                      ON "orders"("orderDraftId");
CREATE INDEX        "orders_restaurantId_idx"                      ON "orders"("restaurantId");
CREATE INDEX        "orders_customerId_idx"                        ON "orders"("customerId");
CREATE INDEX        "orders_restaurantId_status_idx"               ON "orders"("restaurantId", "status");
CREATE INDEX        "order_items_orderId_idx"                      ON "order_items"("orderId");
CREATE UNIQUE INDEX "payments_orderId_key"                         ON "payments"("orderId");
CREATE INDEX        "conversations_restaurantId_idx"               ON "conversations"("restaurantId");
CREATE INDEX        "conversations_customerId_idx"                 ON "conversations"("customerId");
CREATE INDEX        "conversations_restaurantId_status_idx"        ON "conversations"("restaurantId", "status");
CREATE INDEX        "conversations_restaurantId_lastMessageAt_idx" ON "conversations"("restaurantId", "lastMessageAt");
CREATE UNIQUE INDEX "messages_externalMessageId_key"               ON "messages"("externalMessageId");
CREATE INDEX        "messages_conversationId_idx"                  ON "messages"("conversationId");
CREATE INDEX        "campaigns_restaurantId_idx"                   ON "campaigns"("restaurantId");
CREATE INDEX        "campaign_executions_campaignId_idx"           ON "campaign_executions"("campaignId");
CREATE INDEX        "offers_restaurantId_idx"                      ON "offers"("restaurantId");
CREATE INDEX        "ai_interaction_logs_restaurantId_idx"         ON "ai_interaction_logs"("restaurantId");
CREATE INDEX        "ai_interaction_logs_conversationId_idx"       ON "ai_interaction_logs"("conversationId");
CREATE UNIQUE INDEX "evolution_configs_restaurantId_key"           ON "evolution_configs"("restaurantId");
CREATE UNIQUE INDEX "restaurant_brand_configs_restaurantId_key"    ON "restaurant_brand_configs"("restaurantId");

-- ── Foreign Keys ──────────────────────────────────────────────────────────────

ALTER TABLE "users"
    ADD CONSTRAINT "users_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customers"
    ADD CONSTRAINT "customers_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "addresses"
    ADD CONSTRAINT "addresses_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_preferences"
    ADD CONSTRAINT "customer_preferences_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_categories"
    ADD CONSTRAINT "menu_categories_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FIXED: was incorrectly "menuItemId" — correct column is "categoryId"
ALTER TABLE "menu_items"
    ADD CONSTRAINT "menu_items_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_segments"
    ADD CONSTRAINT "customer_segments_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_drafts"
    ADD CONSTRAINT "order_drafts_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_drafts"
    ADD CONSTRAINT "order_drafts_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_drafts"
    ADD CONSTRAINT "order_drafts_deliveryAddressId_fkey"
    FOREIGN KEY ("deliveryAddressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_draft_items"
    ADD CONSTRAINT "order_draft_items_orderDraftId_fkey"
    FOREIGN KEY ("orderDraftId") REFERENCES "order_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_draft_items"
    ADD CONSTRAINT "order_draft_items_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_orderDraftId_fkey"
    FOREIGN KEY ("orderDraftId") REFERENCES "order_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_deliveryAddressId_fkey"
    FOREIGN KEY ("deliveryAddressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_items"
    ADD CONSTRAINT "order_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_items"
    ADD CONSTRAINT "order_items_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_segmentId_fkey"
    FOREIGN KEY ("segmentId") REFERENCES "customer_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "campaign_executions"
    ADD CONSTRAINT "campaign_executions_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_segment_memberships"
    ADD CONSTRAINT "customer_segment_memberships_segmentId_fkey"
    FOREIGN KEY ("segmentId") REFERENCES "customer_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_segment_memberships"
    ADD CONSTRAINT "customer_segment_memberships_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offers"
    ADD CONSTRAINT "offers_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_interaction_logs"
    ADD CONSTRAINT "ai_interaction_logs_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evolution_configs"
    ADD CONSTRAINT "evolution_configs_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "restaurant_brand_configs"
    ADD CONSTRAINT "restaurant_brand_configs_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
