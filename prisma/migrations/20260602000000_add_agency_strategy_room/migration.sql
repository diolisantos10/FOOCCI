-- ════════════════════════════════════════════════════════════════════════════
--  Agency OS — Client Projects + AI Strategy Room
--  Additive only. Internal tool for the agency to manage restaurant client
--  engagements. Strategy Room generates rule-based specialist perspectives.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "AgencyProjectStatus" AS ENUM ('DRAFT', 'STRATEGY_PENDING', 'STRATEGY_DONE', 'PROPOSAL_READY', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StrategyRoomStatus" AS ENUM ('PENDING', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "agency_projects" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "audience" TEXT,
    "timeline" TEXT,
    "budget" TEXT,
    "services" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "status" "AgencyProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_room_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "StrategyRoomStatus" NOT NULL DEFAULT 'DONE',
    "briefSnapshot" JSONB NOT NULL,
    "strategist" JSONB NOT NULL,
    "socialMedia" JSONB NOT NULL,
    "creative" JSONB NOT NULL,
    "paidTraffic" JSONB NOT NULL,
    "businessScope" JSONB NOT NULL,
    "criticalReview" JSONB NOT NULL,
    "synthesis" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_room_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agency_projects_restaurantId_idx" ON "agency_projects"("restaurantId");

-- CreateIndex
CREATE INDEX "agency_projects_status_idx" ON "agency_projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_room_sessions_projectId_key" ON "strategy_room_sessions"("projectId");

-- AddForeignKey
ALTER TABLE "agency_projects" ADD CONSTRAINT "agency_projects_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_room_sessions" ADD CONSTRAINT "strategy_room_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "agency_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
