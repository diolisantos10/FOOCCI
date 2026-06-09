-- Waiter Runtime Merge — Library→runtime bridge + versioning (ADDITIVE ONLY).
-- No existing column is dropped or retyped. Nothing here touches checkout,
-- payment, Pix, order creation, or any business table. Library techniques only
-- reach the Waiter prompt via an ACTIVE LIBRARY_ASSISTED version, and only when
-- the technique is ACTIVE + runtimeEnabled.

-- AlterEnum (additive — allow techniques to be explicitly rejected)
ALTER TYPE "AgentLibraryTechniqueStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WaiterRuntimeVersionStatus" AS ENUM ('DRAFT', 'TESTING', 'ACTIVE', 'ROLLED_BACK', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "WaiterRuntimeMode" AS ENUM ('CURRENT', 'LIBRARY_ASSISTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable (additive curation/runtime governance columns)
ALTER TABLE "agent_library_techniques"
  ADD COLUMN IF NOT EXISTS "runtimeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "runtimePriority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "qualityScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "tags" TEXT;

-- CreateIndex (technique runtime selection)
CREATE INDEX IF NOT EXISTS "agent_library_techniques_agentSlug_status_runtimeEnabled_idx"
  ON "agent_library_techniques" ("agentSlug", "status", "runtimeEnabled");

-- CreateTable
CREATE TABLE IF NOT EXISTS "waiter_runtime_versions" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL DEFAULT 'waiter',
    "restaurantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WaiterRuntimeVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "WaiterRuntimeMode" NOT NULL DEFAULT 'CURRENT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "libraryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxTechniques" INTEGER NOT NULL DEFAULT 6,
    "techniqueSelectionPolicy" TEXT NOT NULL DEFAULT 'PRIORITY_DESC',
    "promptPolicy" TEXT,
    "safetyPolicy" TEXT,
    "metadata" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "rollbackToVersionId" TEXT,
    "qualityStatus" TEXT,
    "lastQualityRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiter_runtime_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "waiter_runtime_version_techniques" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "techniqueId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waiter_runtime_version_techniques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "waiter_runtime_versions_agentSlug_restaurantId_status_idx"
  ON "waiter_runtime_versions" ("agentSlug", "restaurantId", "status");
CREATE INDEX IF NOT EXISTS "waiter_runtime_versions_agentSlug_isActive_idx"
  ON "waiter_runtime_versions" ("agentSlug", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "waiter_runtime_version_techniques_versionId_techniqueId_key"
  ON "waiter_runtime_version_techniques" ("versionId", "techniqueId");
CREATE INDEX IF NOT EXISTS "waiter_runtime_version_techniques_versionId_idx"
  ON "waiter_runtime_version_techniques" ("versionId");
CREATE INDEX IF NOT EXISTS "waiter_runtime_version_techniques_techniqueId_idx"
  ON "waiter_runtime_version_techniques" ("techniqueId");

-- AddForeignKey
ALTER TABLE "waiter_runtime_version_techniques"
  ADD CONSTRAINT "waiter_runtime_version_techniques_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "waiter_runtime_versions" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waiter_runtime_version_techniques"
  ADD CONSTRAINT "waiter_runtime_version_techniques_techniqueId_fkey"
  FOREIGN KEY ("techniqueId") REFERENCES "agent_library_techniques" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
