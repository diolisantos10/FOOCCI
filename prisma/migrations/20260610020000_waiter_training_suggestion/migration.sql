-- Waiter Training Suggestion — real cases become training PROPOSALS (ADDITIVE ONLY).
-- Sanitized excerpts only (no PII, no raw transcript). Soft references (no FKs).
-- Approving records an "approved learning" — it NEVER changes the real runtime.

CREATE TABLE IF NOT EXISTS "waiter_training_suggestions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "agentSlug" TEXT NOT NULL DEFAULT 'waiter',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "title" TEXT NOT NULL,
    "situationSummary" TEXT NOT NULL,
    "customerIntent" TEXT NOT NULL,
    "whatHappened" TEXT NOT NULL,
    "problemDetected" TEXT NOT NULL,
    "idealResponse" TEXT NOT NULL,
    "trainingRule" TEXT NOT NULL,
    "expectedImpact" TEXT NOT NULL,
    "suggestedActionType" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "sanitizedCustomerExcerpt" TEXT,
    "sanitizedWaiterExcerpt" TEXT,
    "technicalDetails" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiter_training_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "waiter_training_suggestions_agentSlug_sourceType_sourceId_key" ON "waiter_training_suggestions" ("agentSlug", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "waiter_training_suggestions_agentSlug_status_idx" ON "waiter_training_suggestions" ("agentSlug", "status");
CREATE INDEX IF NOT EXISTS "waiter_training_suggestions_restaurantId_status_idx" ON "waiter_training_suggestions" ("restaurantId", "status");
