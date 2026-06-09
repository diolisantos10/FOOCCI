-- CreateTable: Agent Training Center
-- CRITICAL: production brain/config NEVER changes automatically.
-- Human approval required for every production change.

CREATE TABLE "agent_training_runs" (
    "id"             TEXT NOT NULL,
    "agentType"      TEXT NOT NULL,
    "restaurantId"   TEXT,
    "status"         TEXT NOT NULL DEFAULT 'QUEUED',
    "source"         TEXT NOT NULL,
    "mode"           TEXT,
    "startedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "totalScenarios" INTEGER NOT NULL DEFAULT 0,
    "passCount"      INTEGER NOT NULL DEFAULT 0,
    "warnCount"      INTEGER NOT NULL DEFAULT 0,
    "failCount"      INTEGER NOT NULL DEFAULT 0,
    "score"          DOUBLE PRECISION,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_training_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_training_scenarios" (
    "id"                   TEXT NOT NULL,
    "runId"                TEXT NOT NULL,
    "restaurantId"         TEXT,
    "source"               TEXT NOT NULL,
    "sourceConversationId" TEXT,
    "title"                TEXT NOT NULL,
    "customerPersona"      TEXT,
    "goal"                 TEXT,
    "transcriptJson"       JSONB NOT NULL,
    "expectedOutcomeJson"  JSONB,
    "actualOutcomeJson"    JSONB,
    "status"               TEXT NOT NULL DEFAULT 'PENDING',
    "score"                DOUBLE PRECISION,
    "riskLevel"            TEXT,
    "failureSummary"       TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_training_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_training_evaluations" (
    "id"               TEXT NOT NULL,
    "scenarioId"       TEXT NOT NULL,
    "evaluatorModel"   TEXT NOT NULL,
    "scoreJson"        JSONB NOT NULL,
    "verdict"          TEXT NOT NULL,
    "strengths"        TEXT,
    "weaknesses"       TEXT,
    "safetyIssues"     TEXT,
    "conversionIssues" TEXT,
    "frictionIssues"   TEXT,
    "recommendation"   TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_training_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_improvement_proposals" (
    "id"                 TEXT NOT NULL,
    "agentType"          TEXT NOT NULL,
    "restaurantId"       TEXT,
    "sourceRunId"        TEXT NOT NULL,
    "sourceScenarioIds"  JSONB NOT NULL,
    "title"              TEXT NOT NULL,
    "problemSummary"     TEXT NOT NULL,
    "rootCause"          TEXT,
    "proposedChangeType" TEXT NOT NULL,
    "proposedPatchText"  TEXT,
    "proposedConfigJson" JSONB,
    "riskLevel"          TEXT NOT NULL DEFAULT 'MEDIUM',
    "expectedImpact"     TEXT,
    "beforeScore"        DOUBLE PRECISION,
    "afterScoreEstimate" DOUBLE PRECISION,
    "status"             TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reviewerNotes"      TEXT,
    "approvedBy"         TEXT,
    "approvedAt"         TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_improvement_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_brain_versions" (
    "id"               TEXT NOT NULL,
    "agentType"        TEXT NOT NULL,
    "restaurantId"     TEXT,
    "versionLabel"     TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'DRAFT',
    "promptText"       TEXT,
    "configJson"       JSONB,
    "sourceProposalId" TEXT,
    "activatedAt"      TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_brain_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_training_configs" (
    "id"                        TEXT NOT NULL,
    "agentType"                 TEXT NOT NULL,
    "enableContinuousTraining"  BOOLEAN NOT NULL DEFAULT false,
    "maxScenariosPerHour"       INTEGER NOT NULL DEFAULT 20,
    "useRealConversationMining" BOOLEAN NOT NULL DEFAULT true,
    "useAiGeneratedScenarios"   BOOLEAN NOT NULL DEFAULT true,
    "minimumScoreThreshold"     DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "autoCreateProposals"       BOOLEAN NOT NULL DEFAULT true,
    "autoApplySandbox"          BOOLEAN NOT NULL DEFAULT false,
    "autoApplyProduction"       BOOLEAN NOT NULL DEFAULT false,
    "enabledRestaurantIds"      JSONB NOT NULL DEFAULT '[]',
    "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                 TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_training_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_training_runs_agentType_status_idx"     ON "agent_training_runs"("agentType", "status");
CREATE INDEX "agent_training_runs_restaurantId_idx"         ON "agent_training_runs"("restaurantId");
CREATE INDEX "agent_training_runs_createdAt_idx"            ON "agent_training_runs"("createdAt");
CREATE INDEX "agent_training_scenarios_runId_idx"           ON "agent_training_scenarios"("runId");
CREATE INDEX "agent_training_scenarios_status_idx"          ON "agent_training_scenarios"("status");
CREATE INDEX "agent_training_scenarios_runId_status_idx"    ON "agent_training_scenarios"("runId", "status");
CREATE INDEX "agent_training_evaluations_scenarioId_idx"    ON "agent_training_evaluations"("scenarioId");
CREATE INDEX "agent_improvement_proposals_status_idx"       ON "agent_improvement_proposals"("status");
CREATE INDEX "agent_improvement_proposals_agentType_status_idx" ON "agent_improvement_proposals"("agentType", "status");
CREATE INDEX "agent_improvement_proposals_sourceRunId_idx"  ON "agent_improvement_proposals"("sourceRunId");
CREATE INDEX "agent_brain_versions_agentType_status_idx"    ON "agent_brain_versions"("agentType", "status");
CREATE UNIQUE INDEX "agent_training_configs_agentType_key"  ON "agent_training_configs"("agentType");

-- AddForeignKey
ALTER TABLE "agent_training_scenarios"   ADD CONSTRAINT "agent_training_scenarios_runId_fkey"      FOREIGN KEY ("runId")            REFERENCES "agent_training_runs"("id")          ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_training_evaluations" ADD CONSTRAINT "agent_training_evaluations_scenarioId_fkey" FOREIGN KEY ("scenarioId")      REFERENCES "agent_training_scenarios"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_improvement_proposals" ADD CONSTRAINT "agent_improvement_proposals_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "agent_training_runs"("id")          ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_brain_versions"       ADD CONSTRAINT "agent_brain_versions_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "agent_improvement_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
