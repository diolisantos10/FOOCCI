-- CreateTable
CREATE TABLE "quality_audit_runs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "globalStatus" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "triggeredBy" TEXT,
    "auditorId" TEXT,
    "countsBySeverity" JSONB NOT NULL,
    "countsByStatus" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_audit_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_audit_findings" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "affectedArea" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quality_audit_runs_createdAt_idx" ON "quality_audit_runs"("createdAt");

-- CreateIndex
CREATE INDEX "quality_audit_runs_globalStatus_idx" ON "quality_audit_runs"("globalStatus");

-- CreateIndex
CREATE INDEX "quality_audit_findings_runId_idx" ON "quality_audit_findings"("runId");

-- CreateIndex
CREATE INDEX "quality_audit_findings_auditorId_severity_idx" ON "quality_audit_findings"("auditorId", "severity");

-- AddForeignKey
ALTER TABLE "quality_audit_findings" ADD CONSTRAINT "quality_audit_findings_runId_fkey" FOREIGN KEY ("runId") REFERENCES "quality_audit_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
