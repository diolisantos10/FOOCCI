-- ════════════════════════════════════════════════════════════════════════════
--  AI Agents Admin — Foundation (Phase 1)
--  Additive only. No existing table is altered except a back-relation FK that
--  targets the NEW table (no change to "restaurants" columns).
--  Runtime stays code-driven: these tables are data-only until Phase 3.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "AgentArea" AS ENUM ('ORCHESTRATOR', 'SECURITY', 'WAITER', 'WHATSAPP', 'CRM', 'UI_UX', 'MANUAL', 'QA', 'INTEGRATION', 'BRANDING', 'ANALYTICS', 'GENERAL');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgentVisibility" AS ENUM ('INTERNAL', 'RESTAURANT', 'PUBLIC');

-- CreateTable
CREATE TABLE "agent_profiles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "area" "AgentArea" NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "mission" TEXT,
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "responsibilities" JSONB NOT NULL DEFAULT '[]',
    "skills" JSONB NOT NULL DEFAULT '[]',
    "allowedActions" JSONB NOT NULL DEFAULT '[]',
    "forbiddenActions" JSONB NOT NULL DEFAULT '[]',
    "tools" JSONB NOT NULL DEFAULT '[]',
    "knowledgeAreas" JSONB NOT NULL DEFAULT '[]',
    "interfaceContext" TEXT,
    "businessRules" JSONB NOT NULL DEFAULT '[]',
    "safetyRules" JSONB NOT NULL DEFAULT '[]',
    "escalationRules" JSONB NOT NULL DEFAULT '[]',
    "promptInstructions" TEXT,
    "outputRules" JSONB NOT NULL DEFAULT '[]',
    "evaluationCriteria" JSONB NOT NULL DEFAULT '[]',
    "extendedSections" JSONB,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "AgentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "isGlobalDefault" BOOLEAN NOT NULL DEFAULT true,
    "isRuntimeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '0.1',
    "source" TEXT DEFAULT 'CODE_SEED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_profile_versions" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeSummary" TEXT,
    "source" TEXT DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "agent_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_agent_profile_overrides" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "displayName" TEXT,
    "toneOverride" TEXT,
    "styleOverride" TEXT,
    "customInstructions" TEXT,
    "enrichmentSections" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_agent_profile_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_profiles_slug_key" ON "agent_profiles"("slug");

-- CreateIndex
CREATE INDEX "agent_profiles_area_idx" ON "agent_profiles"("area");

-- CreateIndex
CREATE INDEX "agent_profiles_status_idx" ON "agent_profiles"("status");

-- CreateIndex
CREATE INDEX "agent_profiles_visibility_idx" ON "agent_profiles"("visibility");

-- CreateIndex
CREATE INDEX "agent_profile_versions_agentProfileId_idx" ON "agent_profile_versions"("agentProfileId");

-- CreateIndex
CREATE INDEX "restaurant_agent_profile_overrides_restaurantId_idx" ON "restaurant_agent_profile_overrides"("restaurantId");

-- CreateIndex
CREATE INDEX "restaurant_agent_profile_overrides_agentProfileId_idx" ON "restaurant_agent_profile_overrides"("agentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_agent_profile_overrides_restaurantId_agentProfil_key" ON "restaurant_agent_profile_overrides"("restaurantId", "agentProfileId");

-- AddForeignKey
ALTER TABLE "agent_profile_versions" ADD CONSTRAINT "agent_profile_versions_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_agent_profile_overrides" ADD CONSTRAINT "restaurant_agent_profile_overrides_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_agent_profile_overrides" ADD CONSTRAINT "restaurant_agent_profile_overrides_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
