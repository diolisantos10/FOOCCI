-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — admin configuration layer (Priority 1.4.1)
--  Additive: BuildOSConfig (DB-driven enable + mode), BuildAuthorizedSender
--  extensions (rawPhone/notes/lastUsedAt). Env vars become bootstrap/emergency
--  fallback only. No relay, no LLM, no execution.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "BuildOSMode" AS ENUM ('INTERNAL_ONLY', 'PRODUCT');

-- AlterTable
ALTER TABLE "build_authorized_senders"
  ADD COLUMN "rawPhone" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "lastUsedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "build_os_config" (
    "id" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "BuildOSMode" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "defaultProjectId" TEXT,
    "allowEnvAuthorizedPhonesFallback" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "build_os_config_pkey" PRIMARY KEY ("id")
);
