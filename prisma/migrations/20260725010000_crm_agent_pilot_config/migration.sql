-- Piloto do Agente de CRM: escada por-agente (config only, nunca envia por si só).
CREATE TABLE "crm_agent_pilot_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SHADOW_ONLY',
    "allowlistedPhones" JSONB NOT NULL DEFAULT '[]',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "abTestPercent" INTEGER NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_agent_pilot_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_agent_pilot_configs_restaurantId_key" ON "crm_agent_pilot_configs"("restaurantId");
