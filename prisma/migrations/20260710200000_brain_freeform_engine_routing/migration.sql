-- FOOCCI Brain — runtime governance (Fase 3-4 do roadmap universal)
-- Aditivo: duas tabelas novas, zero alteração em tabelas existentes.

-- CreateTable
CREATE TABLE "brain_freeform_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SHADOW_ONLY',
    "allowlistedPhones" JSONB NOT NULL DEFAULT '[]',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_freeform_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brain_freeform_configs_restaurantId_key" ON "brain_freeform_configs"("restaurantId");

-- CreateTable
CREATE TABLE "brain_engine_routing" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "agentId" TEXT NOT NULL,
    "taskProfile" TEXT NOT NULL DEFAULT 'REASON',
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "appliedFromChangeRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_engine_routing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brain_engine_routing_businessId_agentId_taskProfile_key" ON "brain_engine_routing"("businessId", "agentId", "taskProfile");

-- CreateIndex
CREATE INDEX "brain_engine_routing_agentId_idx" ON "brain_engine_routing"("agentId");
