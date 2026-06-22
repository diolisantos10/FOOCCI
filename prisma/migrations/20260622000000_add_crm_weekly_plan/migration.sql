-- CreateEnum
CREATE TYPE "CrmWeeklyPlanStatus" AS ENUM ('PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CrmWeeklyPlanItemStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "restaurant_crm_profiles" ADD COLUMN "autonomyMode" TEXT NOT NULL DEFAULT 'COPILOT';
ALTER TABLE "restaurant_crm_profiles" ADD COLUMN "autonomyConfig" JSONB;

-- CreateTable
CREATE TABLE "crm_weekly_plans" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "status" "CrmWeeklyPlanStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "autonomyMode" TEXT NOT NULL DEFAULT 'COPILOT',
    "summary" JSONB,
    "warnings" TEXT[],
    "notes" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_weekly_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_weekly_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "targetSegment" TEXT NOT NULL,
    "templateId" TEXT,
    "objective" TEXT,
    "messageTemplate" TEXT NOT NULL,
    "estimatedAudience" INTEGER NOT NULL DEFAULT 0,
    "estimatedRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "suggestedScheduleConfig" JSONB,
    "couponCode" TEXT,
    "status" "CrmWeeklyPlanItemStatus" NOT NULL DEFAULT 'PROPOSED',
    "campaignId" TEXT,
    "executionError" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_weekly_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_weekly_plans_restaurantId_weekStart_idx" ON "crm_weekly_plans"("restaurantId", "weekStart");

-- CreateIndex
CREATE INDEX "crm_weekly_plans_restaurantId_status_idx" ON "crm_weekly_plans"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "crm_weekly_plan_items_planId_idx" ON "crm_weekly_plan_items"("planId");

-- CreateIndex
CREATE INDEX "crm_weekly_plan_items_restaurantId_status_idx" ON "crm_weekly_plan_items"("restaurantId", "status");

-- AddForeignKey
ALTER TABLE "crm_weekly_plan_items" ADD CONSTRAINT "crm_weekly_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "crm_weekly_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
