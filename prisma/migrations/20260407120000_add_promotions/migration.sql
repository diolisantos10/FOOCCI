-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENTAGE', 'FIXED', 'COMBO', 'FREE_DELIVERY', 'COUPON');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "PromotionChannel" AS ENUM ('QR_MENU', 'DELIVERY', 'WHATSAPP', 'ALL');

-- CreateEnum
CREATE TYPE "PromotionTarget" AS ENUM ('PRODUCT', 'CATEGORY', 'ORDER');

-- CreateTable
CREATE TABLE "promotions" (
    "id"                TEXT NOT NULL,
    "restaurantId"      TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "description"       TEXT,
    "type"              "PromotionType" NOT NULL,
    "status"            "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "discountValue"     DECIMAL(10,2) NOT NULL DEFAULT 0,
    "target"            "PromotionTarget" NOT NULL DEFAULT 'ORDER',
    "targetProductIds"  TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channel"           "PromotionChannel" NOT NULL DEFAULT 'ALL',
    "couponCode"        TEXT,
    "startsAt"          TIMESTAMP(3),
    "endsAt"            TIMESTAMP(3),
    "daysOfWeek"        INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "timeFrom"          TEXT,
    "timeTo"            TEXT,
    "minOrderValue"     DECIMAL(10,2),
    "minQuantity"       INTEGER,
    "maxUses"           INTEGER,
    "usedCount"         INTEGER NOT NULL DEFAULT 0,
    "oneTimePerUser"    BOOLEAN NOT NULL DEFAULT false,
    "combinable"        BOOLEAN NOT NULL DEFAULT false,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotions_restaurantId_idx" ON "promotions"("restaurantId");

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
