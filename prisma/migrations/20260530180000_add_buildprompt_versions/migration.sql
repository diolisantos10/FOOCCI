-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — Prompt draft + confirmation foundation (Priority 1.4)
--  Additive: extends BuildCommandStatus, adds prompt enums + build_prompt_versions.
--  Deterministic TEMPLATE drafts only — NO LLM, NO Claude, NO GitHub, NO execution.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterEnum: new command lifecycle states (additive)
ALTER TYPE "BuildCommandStatus" ADD VALUE IF NOT EXISTS 'DRAFTED';
ALTER TYPE "BuildCommandStatus" ADD VALUE IF NOT EXISTS 'APPROVED_FOR_RELAY';
ALTER TYPE "BuildCommandStatus" ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';

-- CreateEnum
CREATE TYPE "BuildPromptKind" AS ENUM ('TECHNICAL_DRAFT');

-- CreateEnum
CREATE TYPE "BuildPromptGeneratedBy" AS ENUM ('TEMPLATE');

-- CreateTable
CREATE TABLE "build_prompt_versions" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "promptText" TEXT NOT NULL,
    "promptKind" "BuildPromptKind" NOT NULL DEFAULT 'TECHNICAL_DRAFT',
    "generatedBy" "BuildPromptGeneratedBy" NOT NULL DEFAULT 'TEMPLATE',
    "revisionInstruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "build_prompt_versions_commandId_idx" ON "build_prompt_versions"("commandId");

-- CreateIndex
CREATE UNIQUE INDEX "build_prompt_versions_commandId_versionNumber_key" ON "build_prompt_versions"("commandId", "versionNumber");

-- AddForeignKey
ALTER TABLE "build_prompt_versions" ADD CONSTRAINT "build_prompt_versions_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "build_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
