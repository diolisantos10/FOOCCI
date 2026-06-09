-- AlterEnum (additive — new deep/chunked extraction states)
ALTER TYPE "AgentLibraryExtractionStatus" ADD VALUE IF NOT EXISTS 'EXTRACTING_TEXT';
ALTER TYPE "AgentLibraryExtractionStatus" ADD VALUE IF NOT EXISTS 'CHUNKING';
ALTER TYPE "AgentLibraryExtractionStatus" ADD VALUE IF NOT EXISTS 'PROCESSING_CHUNKS';
ALTER TYPE "AgentLibraryExtractionStatus" ADD VALUE IF NOT EXISTS 'CONSOLIDATING';
ALTER TYPE "AgentLibraryExtractionStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "AgentLibraryExtractionStatus" ADD VALUE IF NOT EXISTS 'READY';

-- CreateTable
CREATE TABLE "agent_library_extraction_jobs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'PENDING',
    "processingMode" TEXT NOT NULL DEFAULT 'CHUNKED',
    "extractionDepth" TEXT NOT NULL DEFAULT 'DEEP',
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "processedChunks" INTEGER NOT NULL DEFAULT 0,
    "failedChunks" INTEGER NOT NULL DEFAULT 0,
    "techniquesFound" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_library_extraction_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_library_source_chunks" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "techniquesExtracted" INTEGER NOT NULL DEFAULT 0,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_library_source_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_library_chunk_technique_candidates" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "techniqueName" TEXT NOT NULL,
    "category" TEXT,
    "purpose" TEXT,
    "principle" TEXT,
    "application" TEXT,
    "usageRule" TEXT,
    "qualityTest" TEXT,
    "goodExample" TEXT,
    "badExample" TEXT,
    "confidence" DOUBLE PRECISION,
    "evidenceSnippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_library_chunk_technique_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_library_extraction_jobs_sourceId_key" ON "agent_library_extraction_jobs"("sourceId");
CREATE INDEX "agent_library_extraction_jobs_stage_idx" ON "agent_library_extraction_jobs"("stage");
CREATE INDEX "agent_library_extraction_jobs_agentSlug_idx" ON "agent_library_extraction_jobs"("agentSlug");
CREATE UNIQUE INDEX "agent_library_source_chunks_jobId_chunkIndex_key" ON "agent_library_source_chunks"("jobId", "chunkIndex");
CREATE INDEX "agent_library_source_chunks_jobId_status_idx" ON "agent_library_source_chunks"("jobId", "status");
CREATE INDEX "agent_library_chunk_technique_candidates_jobId_idx" ON "agent_library_chunk_technique_candidates"("jobId");

-- AddForeignKey
ALTER TABLE "agent_library_extraction_jobs" ADD CONSTRAINT "agent_library_extraction_jobs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "agent_library_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_library_source_chunks" ADD CONSTRAINT "agent_library_source_chunks_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "agent_library_extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_library_chunk_technique_candidates" ADD CONSTRAINT "agent_library_chunk_technique_candidates_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "agent_library_extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
