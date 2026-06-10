-- Waiter Result Evidence — Provas de Resultado / Evidências Comerciais (ADDITIVE ONLY).
-- New standalone table with soft references (no FKs): deleting an order/conversation
-- never erases an approved proof. Excerpts are sanitized BEFORE persisting (no PII).
-- Nothing here touches runtime, orders, payments or messaging.

CREATE TABLE IF NOT EXISTS "waiter_result_evidence" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL DEFAULT 'waiter',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "valueBefore" DECIMAL(10,2),
    "valueAfter" DECIMAL(10,2),
    "incrementalValue" DECIMAL(10,2),
    "orderValue" DECIMAL(10,2),
    "customerSegment" TEXT,
    "sanitizedExcerpt" TEXT,
    "proofScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isPublicCandidate" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiter_result_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "waiter_result_evidence_restaurantId_evidenceType_idx" ON "waiter_result_evidence" ("restaurantId", "evidenceType");
CREATE INDEX IF NOT EXISTS "waiter_result_evidence_restaurantId_status_idx" ON "waiter_result_evidence" ("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "waiter_result_evidence_sourceType_sourceId_idx" ON "waiter_result_evidence" ("sourceType", "sourceId");
