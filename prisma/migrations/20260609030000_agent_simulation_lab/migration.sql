-- Agent Simulation Lab — safe dry-run behavioural simulation (ADDITIVE ONLY).
-- No existing table is altered. Records simulation runs, scenarios and
-- opportunities for human review. Nothing here touches checkout / payment / Pix /
-- order creation / WhatsApp / Evolution / CRM / the real runtime.

-- CreateEnum
DO $$ BEGIN CREATE TYPE "AgentSimulationMode" AS ENUM ('MANUAL', 'CRON', 'DIAGNOSTIC'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AgentSimulationDriver" AS ENUM ('SERVICE', 'API', 'UI_STUB', 'PLAYWRIGHT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AgentSimulationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AgentSimulationScenarioStatus" AS ENUM ('PASS', 'WARNING', 'FAIL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AgentSimulationSeverity" AS ENUM ('P0', 'P1', 'P2', 'INFO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AgentSimulationOpportunityType" AS ENUM ('BUG', 'MISSED_SALE', 'UX_FRICTION', 'PROMPT_GAP', 'POLICY_GAP', 'LIBRARY_OPPORTUNITY', 'TRAINING_OPPORTUNITY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AgentSimulationOpportunityStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'BACKLOGGED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_simulation_runs" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "departmentSlug" TEXT NOT NULL,
    "restaurantId" TEXT,
    "mode" "AgentSimulationMode" NOT NULL DEFAULT 'MANUAL',
    "driver" "AgentSimulationDriver" NOT NULL DEFAULT 'SERVICE',
    "status" "AgentSimulationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "seed" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "scenariosTotal" INTEGER NOT NULL DEFAULT 0,
    "scenariosPassed" INTEGER NOT NULL DEFAULT 0,
    "scenariosWarning" INTEGER NOT NULL DEFAULT 0,
    "scenariosFailed" INTEGER NOT NULL DEFAULT 0,
    "p0Count" INTEGER NOT NULL DEFAULT 0,
    "p1Count" INTEGER NOT NULL DEFAULT 0,
    "p2Count" INTEGER NOT NULL DEFAULT 0,
    "opportunityCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_simulation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_simulation_scenarios" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "scenarioKey" TEXT NOT NULL,
    "scenarioType" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "customerGoal" TEXT NOT NULL,
    "customerConstraints" TEXT,
    "initialMessage" TEXT NOT NULL,
    "status" "AgentSimulationScenarioStatus" NOT NULL DEFAULT 'PASS',
    "severity" "AgentSimulationSeverity" NOT NULL DEFAULT 'INFO',
    "score" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "evidence" TEXT,
    "transcript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_simulation_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_simulation_opportunities" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenarioId" TEXT,
    "agentSlug" TEXT NOT NULL,
    "type" "AgentSimulationOpportunityType" NOT NULL,
    "severity" "AgentSimulationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" TEXT,
    "recommendation" TEXT NOT NULL,
    "expectedImpact" TEXT,
    "status" "AgentSimulationOpportunityStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_simulation_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_simulation_runs_agentSlug_createdAt_idx" ON "agent_simulation_runs" ("agentSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_simulation_scenarios_runId_idx" ON "agent_simulation_scenarios" ("runId");
CREATE INDEX IF NOT EXISTS "agent_simulation_opportunities_runId_idx" ON "agent_simulation_opportunities" ("runId");
CREATE INDEX IF NOT EXISTS "agent_simulation_opportunities_agentSlug_status_idx" ON "agent_simulation_opportunities" ("agentSlug", "status");

-- AddForeignKey
ALTER TABLE "agent_simulation_scenarios" ADD CONSTRAINT "agent_simulation_scenarios_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_simulation_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_simulation_opportunities" ADD CONSTRAINT "agent_simulation_opportunities_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_simulation_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_simulation_opportunities" ADD CONSTRAINT "agent_simulation_opportunities_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "agent_simulation_scenarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
