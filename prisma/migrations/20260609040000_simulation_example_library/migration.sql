-- Simulation Example Library — sanitized real-conversation patterns (ADDITIVE ONLY).
-- Real conversations are read read-only; only sanitized, classified examples are
-- stored here. Nothing touches checkout / payment / Pix / orders / WhatsApp / the
-- real runtime, and no raw conversation is ever written.

-- CreateEnum
DO $$ BEGIN CREATE TYPE "AgentSimulationExampleSourceType" AS ENUM ('REAL_CONVERSATION', 'MANUAL', 'GENERATED', 'IMPORTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AgentSimulationExampleStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'BACKLOGGED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_simulation_examples" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "restaurantId" TEXT,
    "sourceType" "AgentSimulationExampleSourceType" NOT NULL DEFAULT 'REAL_CONVERSATION',
    "sourceId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "intent" TEXT NOT NULL,
    "scenarioType" TEXT NOT NULL,
    "customerProfile" TEXT,
    "sanitizedTranscript" TEXT,
    "summary" TEXT NOT NULL,
    "labels" TEXT,
    "riskFlags" TEXT,
    "qualityNotes" TEXT,
    "status" "AgentSimulationExampleStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "isApprovedForSimulation" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_simulation_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "agent_simulation_examples_agentSlug_sourceType_sourceId_key" ON "agent_simulation_examples" ("agentSlug", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "agent_simulation_examples_agentSlug_status_idx" ON "agent_simulation_examples" ("agentSlug", "status");
CREATE INDEX IF NOT EXISTS "agent_simulation_examples_agentSlug_isApprovedForSimulation_idx" ON "agent_simulation_examples" ("agentSlug", "isApprovedForSimulation");
