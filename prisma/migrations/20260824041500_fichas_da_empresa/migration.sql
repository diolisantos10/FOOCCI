-- Fichas da empresa sobre `AgentProfile` (ADR-002 + ADR-006).
--
-- Aditiva por inteiro: 2 tipos novos, 6 colunas novas com valor padrão, 2
-- índices e 3 chaves estrangeiras. Nenhum DROP, nenhum ALTER destrutivo,
-- nenhuma linha existente alterada.
--
-- As 8 fichas de produto que já existem continuam significando exatamente o que
-- significavam: `population` nasce PRODUTO e `executionMode` nasce AI, que é o
-- que elas sempre foram. As colunas de departamento e de dono nascem nulas
-- porque agente de produto não pertence a departamento da empresa.
--
-- As três chaves estrangeiras usam ON DELETE SET NULL de propósito: apagar um
-- departamento ou um cargo NÃO pode apagar a ficha do trabalho que existia ali.
-- A ficha perde o vínculo e fica órfã, visível — que é o estado honesto.

-- CreateEnum
CREATE TYPE "AgentPopulation" AS ENUM ('PRODUTO', 'DESENVOLVIMENTO', 'EMPRESA');

-- CreateEnum
CREATE TYPE "AgentExecutionMode" AS ENUM ('AI', 'HUMAN', 'HYBRID');

-- AlterTable
ALTER TABLE "agent_profiles" ADD COLUMN     "catalogNumber" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "executionMode" "AgentExecutionMode" NOT NULL DEFAULT 'AI',
ADD COLUMN     "managerPositionId" TEXT,
ADD COLUMN     "ownerPositionId" TEXT,
ADD COLUMN     "population" "AgentPopulation" NOT NULL DEFAULT 'PRODUTO';

-- CreateIndex
CREATE INDEX "agent_profiles_population_idx" ON "agent_profiles"("population");

-- CreateIndex
CREATE INDEX "agent_profiles_departmentId_idx" ON "agent_profiles"("departmentId");

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_ownerPositionId_fkey" FOREIGN KEY ("ownerPositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_managerPositionId_fkey" FOREIGN KEY ("managerPositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
