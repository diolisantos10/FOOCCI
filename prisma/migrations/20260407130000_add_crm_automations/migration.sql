-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('REACTIVATION', 'BIRTHDAY', 'POST_ORDER');

-- CreateTable
CREATE TABLE "crm_automations" (
    "id"              TEXT NOT NULL,
    "restaurantId"    TEXT NOT NULL,
    "trigger"         "AutomationTrigger" NOT NULL,
    "isEnabled"       BOOLEAN NOT NULL DEFAULT false,
    "messageTemplate" TEXT NOT NULL DEFAULT '',
    "triggerAfterDays" INTEGER NOT NULL DEFAULT 30,
    "discountType"    TEXT,
    "discountValue"   DECIMAL(10,2),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_automations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_automations_restaurantId_trigger_key"
    ON "crm_automations"("restaurantId", "trigger");

-- CreateIndex
CREATE INDEX "crm_automations_restaurantId_idx" ON "crm_automations"("restaurantId");

-- AddForeignKey
ALTER TABLE "crm_automations" ADD CONSTRAINT "crm_automations_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
