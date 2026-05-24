-- CreateEnum
CREATE TYPE "ManualArea" AS ENUM ('GENERAL', 'WAITER_AGENT', 'CRM', 'WHATSAPP', 'UI_UX', 'BRANDING', 'INTEGRATIONS', 'CHECKOUT', 'PAYMENTS', 'ANALYTICS', 'SECURITY', 'BACKLOG');

-- CreateEnum
CREATE TYPE "ManualRuleStatus" AS ENUM ('IMPLEMENTED', 'PARTIAL', 'DECIDED', 'BACKLOG');

-- CreateEnum
CREATE TYPE "ManualChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ManualSourceType" AS ENUM ('CHATGPT', 'CLAUDE_AUDIT', 'CODE_AUDIT', 'MANUAL', 'DEPLOY', 'BUGFIX', 'PRODUCT_DECISION');

-- CreateTable
CREATE TABLE "operational_manual_chapters" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" "ManualArea" NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "content" TEXT NOT NULL,
    "status" "ManualRuleStatus" NOT NULL DEFAULT 'BACKLOG',
    "version" TEXT NOT NULL DEFAULT '0.1',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "agentVisibility" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "approvedBy" TEXT,

    CONSTRAINT "operational_manual_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_manual_revisions" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "changeSummary" TEXT,
    "sourceType" "ManualSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "operational_manual_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_manual_change_requests" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT,
    "title" TEXT NOT NULL,
    "proposedContent" TEXT NOT NULL,
    "proposedDiff" TEXT,
    "reason" TEXT NOT NULL,
    "impactAreas" TEXT,
    "status" "ManualChangeStatus" NOT NULL DEFAULT 'PENDING',
    "sourceType" "ManualSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "reviewedBy" TEXT,

    CONSTRAINT "operational_manual_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_manual_decision_logs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "area" "ManualArea" NOT NULL DEFAULT 'GENERAL',
    "status" "ManualRuleStatus" NOT NULL DEFAULT 'DECIDED',
    "sourceType" "ManualSourceType" NOT NULL DEFAULT 'PRODUCT_DECISION',
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "operational_manual_decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operational_manual_chapters_slug_key" ON "operational_manual_chapters"("slug");

-- CreateIndex
CREATE INDEX "operational_manual_chapters_area_idx" ON "operational_manual_chapters"("area");

-- CreateIndex
CREATE INDEX "operational_manual_chapters_status_idx" ON "operational_manual_chapters"("status");

-- CreateIndex
CREATE INDEX "operational_manual_chapters_isPublished_idx" ON "operational_manual_chapters"("isPublished");

-- CreateIndex
CREATE INDEX "operational_manual_revisions_chapterId_idx" ON "operational_manual_revisions"("chapterId");

-- CreateIndex
CREATE INDEX "operational_manual_change_requests_chapterId_idx" ON "operational_manual_change_requests"("chapterId");

-- CreateIndex
CREATE INDEX "operational_manual_change_requests_status_idx" ON "operational_manual_change_requests"("status");

-- CreateIndex
CREATE INDEX "operational_manual_decision_logs_area_idx" ON "operational_manual_decision_logs"("area");

-- CreateIndex
CREATE INDEX "operational_manual_decision_logs_status_idx" ON "operational_manual_decision_logs"("status");

-- AddForeignKey
ALTER TABLE "operational_manual_revisions" ADD CONSTRAINT "operational_manual_revisions_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "operational_manual_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_manual_change_requests" ADD CONSTRAINT "operational_manual_change_requests_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "operational_manual_chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
