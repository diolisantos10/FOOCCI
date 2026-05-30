-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — Prompt Relay / Command Router foundation (Priority 1.1)
--  Additive only. Project-agnostic (NO restaurantId). Intake + audit only —
--  no Claude relay, no GitHub, no LLM, no execution.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "BuildCommandStatus" AS ENUM ('RECEIVED', 'AWAITING_CONFIRMATION', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "BuildCommandSourceChannel" AS ENUM ('WHATSAPP', 'ADMIN');

-- CreateEnum
CREATE TYPE "BuildRiskLevel" AS ENUM ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BuildTaskType" AS ENUM ('UNKNOWN', 'FEATURE', 'FIX', 'REFACTOR', 'AUDIT', 'DOCS');

-- CreateTable
CREATE TABLE "build_projects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "githubOwner" TEXT,
    "githubRepo" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "build_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_authorized_senders" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowedProjectIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "build_authorized_senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_commands" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "senderPhone" TEXT NOT NULL,
    "senderName" TEXT,
    "sourceChannel" "BuildCommandSourceChannel" NOT NULL DEFAULT 'WHATSAPP',
    "rawMessage" TEXT NOT NULL,
    "commandPrefix" TEXT NOT NULL,
    "commandText" TEXT NOT NULL,
    "status" "BuildCommandStatus" NOT NULL DEFAULT 'RECEIVED',
    "riskLevel" "BuildRiskLevel" NOT NULL DEFAULT 'UNKNOWN',
    "taskType" "BuildTaskType" NOT NULL DEFAULT 'UNKNOWN',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "build_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_command_events" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_command_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "build_projects_slug_key" ON "build_projects"("slug");

-- CreateIndex
CREATE INDEX "build_projects_isActive_idx" ON "build_projects"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "build_authorized_senders_phone_key" ON "build_authorized_senders"("phone");

-- CreateIndex
CREATE INDEX "build_authorized_senders_isActive_idx" ON "build_authorized_senders"("isActive");

-- CreateIndex
CREATE INDEX "build_commands_status_idx" ON "build_commands"("status");

-- CreateIndex
CREATE INDEX "build_commands_senderPhone_idx" ON "build_commands"("senderPhone");

-- CreateIndex
CREATE INDEX "build_commands_projectId_idx" ON "build_commands"("projectId");

-- CreateIndex
CREATE INDEX "build_commands_createdAt_idx" ON "build_commands"("createdAt");

-- CreateIndex
CREATE INDEX "build_command_events_commandId_idx" ON "build_command_events"("commandId");

-- AddForeignKey
ALTER TABLE "build_commands" ADD CONSTRAINT "build_commands_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "build_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_command_events" ADD CONSTRAINT "build_command_events_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "build_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
