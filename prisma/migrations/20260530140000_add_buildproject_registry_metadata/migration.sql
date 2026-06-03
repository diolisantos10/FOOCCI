-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — BuildProject registry metadata (Priority 1.2)
--  Additive only: adds registry/metadata columns to the existing build_projects
--  table. No secrets; githubOwner/githubRepo (from 1.1) stay metadata-only.
--  Nothing here drives runtime, prompt generation, or relay.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "build_projects"
  ADD COLUMN "projectRules"  JSONB,
  ADD COLUMN "promptContext" TEXT,
  ADD COLUMN "displayOrder"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "category"      TEXT,
  ADD COLUMN "riskNotes"     TEXT;
