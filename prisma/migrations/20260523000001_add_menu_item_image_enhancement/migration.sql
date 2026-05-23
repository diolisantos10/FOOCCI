-- CreateEnum
CREATE TYPE "MenuItemEnhancementStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'APPROVED',
  'REJECTED',
  'LOW_SOURCE_QUALITY',
  'NEEDS_NEW_PHOTO'
);

-- CreateTable
CREATE TABLE "menu_item_image_enhancements" (
    "id"           TEXT NOT NULL,
    "menuItemId"   TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "originalUrl"  TEXT NOT NULL,
    "enhancedUrl"  TEXT,
    "status"       "MenuItemEnhancementStatus" NOT NULL DEFAULT 'PENDING',
    "processMode"  TEXT,
    "providerName" TEXT,
    "errorReason"  TEXT,
    "notes"        TEXT,
    "approvedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_image_enhancements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_image_enhancements_menuItemId_key"
    ON "menu_item_image_enhancements"("menuItemId");

-- CreateIndex
CREATE INDEX "menu_item_image_enhancements_restaurantId_idx"
    ON "menu_item_image_enhancements"("restaurantId");

-- CreateIndex
CREATE INDEX "menu_item_image_enhancements_restaurantId_status_idx"
    ON "menu_item_image_enhancements"("restaurantId", "status");

-- AddForeignKey
ALTER TABLE "menu_item_image_enhancements"
    ADD CONSTRAINT "menu_item_image_enhancements_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
