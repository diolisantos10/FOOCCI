-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — ADMIN/SYSTEM-level WhatsApp channel, independent of restaurants.
--  Additive only. Stores the Foocci/Futi Admin Evolution instance credentials
--  (encrypted) with NO restaurantId — the Build OS command line does not belong
--  to any tenant. Restaurant EvolutionConfig is untouched.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "buildos_master_whatsapp_config" (
    "id" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildos_master_whatsapp_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buildos_master_whatsapp_config_instanceName_key" ON "buildos_master_whatsapp_config"("instanceName");
