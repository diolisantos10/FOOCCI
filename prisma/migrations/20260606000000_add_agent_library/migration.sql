-- ════════════════════════════════════════════════════════════════════════════
--  Agent Library — Workbench v1. Additive only: two new tables for curated
--  technical FORMATION (sources + techniques) per agent. No existing table is
--  altered. Not read by any runtime (Waiter/CRM/WhatsApp). Copyright-safe:
--  stores syntheses/techniques, never full reproductions.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "AgentLibrarySourceType" AS ENUM ('BOOK', 'PDF', 'ARTICLE', 'MANUAL', 'TRAINING', 'PLAYBOOK', 'INTERNAL_NOTE');

-- CreateEnum
CREATE TYPE "AgentLibraryExtractionStatus" AS ENUM ('PENDING', 'EXTRACTING', 'EXTRACTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentLibrarySourceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgentLibraryTechniqueStatus" AS ENUM ('EXTRACTED', 'IN_REVIEW', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "agent_library_sources" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "sourceType" "AgentLibrarySourceType" NOT NULL DEFAULT 'INTERNAL_NOTE',
    "category" TEXT,
    "description" TEXT,
    "rawText" TEXT,
    "fileUrl" TEXT,
    "storageKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "extractionStatus" "AgentLibraryExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "status" "AgentLibrarySourceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_library_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_library_techniques" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "category" TEXT,
    "techniqueName" TEXT NOT NULL,
    "purpose" TEXT,
    "principle" TEXT,
    "application" TEXT,
    "usageRule" TEXT,
    "qualityTest" TEXT,
    "goodExample" TEXT,
    "badExample" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" "AgentLibraryTechniqueStatus" NOT NULL DEFAULT 'EXTRACTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_library_techniques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_library_sources_agentSlug_idx" ON "agent_library_sources"("agentSlug");

-- CreateIndex
CREATE INDEX "agent_library_sources_status_idx" ON "agent_library_sources"("status");

-- CreateIndex
CREATE INDEX "agent_library_techniques_agentSlug_idx" ON "agent_library_techniques"("agentSlug");

-- CreateIndex
CREATE INDEX "agent_library_techniques_sourceId_idx" ON "agent_library_techniques"("sourceId");

-- CreateIndex
CREATE INDEX "agent_library_techniques_status_idx" ON "agent_library_techniques"("status");

-- AddForeignKey
ALTER TABLE "agent_library_techniques" ADD CONSTRAINT "agent_library_techniques_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "agent_library_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
