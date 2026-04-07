-- CreateEnum
CREATE TYPE "CRMMessageStyle" AS ENUM ('FRIENDLY', 'PLAYFUL', 'DIRECT', 'EMOTIONAL', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CRMToneProfile" AS ENUM ('CASUAL', 'PREMIUM_FEEL', 'FRIENDLY', 'SALES_FORWARD');

-- CRMActionLog: one row per CRM message dispatched
CREATE TABLE "crm_action_logs" (
    "id"           TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId"   TEXT,
    "actionType"   TEXT NOT NULL,
    "messageStyle" "CRMMessageStyle" NOT NULL,
    "messageText"  TEXT NOT NULL,
    "responded"    BOOLEAN NOT NULL DEFAULT false,
    "converted"    BOOLEAN NOT NULL DEFAULT false,
    "revenue"      DECIMAL(10,2),
    "respondedAt"  TIMESTAMP(3),
    "convertedAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_action_logs_restaurantId_idx"        ON "crm_action_logs"("restaurantId");
CREATE INDEX "crm_action_logs_restaurantId_style_idx"  ON "crm_action_logs"("restaurantId", "messageStyle");
CREATE INDEX "crm_action_logs_restaurantId_created_idx" ON "crm_action_logs"("restaurantId", "createdAt");

ALTER TABLE "crm_action_logs" ADD CONSTRAINT "crm_action_logs_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RestaurantCRMProfile: one row per restaurant, holds tone preference
-- and cached style weights (recomputed by the service)
CREATE TABLE "restaurant_crm_profiles" (
    "id"             TEXT NOT NULL,
    "restaurantId"   TEXT NOT NULL,
    "toneProfile"    "CRMToneProfile" NOT NULL DEFAULT 'FRIENDLY',
    "styleWeights"   JSONB NOT NULL DEFAULT '{}',
    "profileVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_crm_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_crm_profiles_restaurantId_key"
    ON "restaurant_crm_profiles"("restaurantId");

ALTER TABLE "restaurant_crm_profiles" ADD CONSTRAINT "restaurant_crm_profiles_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
