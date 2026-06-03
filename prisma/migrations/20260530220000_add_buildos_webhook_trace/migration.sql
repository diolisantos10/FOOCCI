-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — webhook diagnostic trace (Priority 1.4.1 debug)
--  Additive only. Persists each Build OS webhook attempt (no secrets; phone
--  masked) so the admin can confirm whether the REAL webhook reached the branch.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "build_webhook_traces" (
    "id" TEXT NOT NULL,
    "maskedPhone" TEXT,
    "prefixDetected" TEXT,
    "configEnabled" BOOLEAN,
    "configSource" TEXT,
    "authorized" BOOLEAN,
    "fromMe" BOOLEAN,
    "commandCreated" BOOLEAN NOT NULL DEFAULT false,
    "promptDrafted" BOOLEAN NOT NULL DEFAULT false,
    "responseSent" BOOLEAN NOT NULL DEFAULT false,
    "shortCircuited" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_webhook_traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "build_webhook_traces_createdAt_idx" ON "build_webhook_traces"("createdAt");
