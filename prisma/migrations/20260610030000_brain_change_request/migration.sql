-- Brain Change Request — persistent governance of the Foocci Brain (ADDITIVE ONLY).
-- Proposals are durable records; only humans approve; approving never applies a
-- change. Nothing here touches runtime, orders, payments or messaging.

CREATE TABLE IF NOT EXISTS "brain_change_requests" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "businessType" TEXT NOT NULL DEFAULT 'RESTAURANT',
    "requestedByType" TEXT NOT NULL,
    "requestedById" TEXT,
    "target" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "proposedChange" JSONB,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requiresQualityGate" BOOLEAN NOT NULL DEFAULT false,
    "runtimeImpact" TEXT NOT NULL DEFAULT 'NONE',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "brain_change_requests_status_riskLevel_idx" ON "brain_change_requests" ("status", "riskLevel");
CREATE INDEX IF NOT EXISTS "brain_change_requests_target_status_idx" ON "brain_change_requests" ("target", "status");
CREATE INDEX IF NOT EXISTS "brain_change_requests_createdAt_idx" ON "brain_change_requests" ("createdAt");
