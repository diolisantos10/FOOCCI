-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — BuildCommand classification metadata (Priority 1.3)
--  Additive only: extends BuildTaskType, adds BuildExecutionIntent enum, and
--  adds deterministic (non-LLM) classification columns to build_commands.
--  No relay, no LLM, no execution.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterEnum: add new task types (additive; existing rows keep their value)
ALTER TYPE "BuildTaskType" ADD VALUE IF NOT EXISTS 'UI_UX';
ALTER TYPE "BuildTaskType" ADD VALUE IF NOT EXISTS 'CONFIG';
ALTER TYPE "BuildTaskType" ADD VALUE IF NOT EXISTS 'TEST';
ALTER TYPE "BuildTaskType" ADD VALUE IF NOT EXISTS 'SECURITY';

-- CreateEnum
CREATE TYPE "BuildExecutionIntent" AS ENUM ('UNKNOWN', 'AUDIT_ONLY', 'IMPLEMENT', 'FIX', 'REVIEW', 'EXPLAIN');

-- AlterTable
ALTER TABLE "build_commands"
  ADD COLUMN "executionIntent" "BuildExecutionIntent" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "targetArea" TEXT,
  ADD COLUMN "requiresHumanConfirmation" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "classificationSummary" TEXT;
