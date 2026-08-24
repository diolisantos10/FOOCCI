-- Governança do departamento (v3, Fase 4).
--
-- Duas tabelas novas e três tipos novos. Aditiva por inteiro: zero DROP,
-- nenhuma coluna existente alterada.
--
-- `delegacoes` registra o caminho de uma ordem descendo a hierarquia, e grava
-- `pulouGerente` NA ESCRITA em vez de deduzir na leitura — o organograma muda, e
-- um relatório de junho precisa dizer o que era verdade em junho.
--
-- `nao_conformidades` guarda o que a auditoria acha. Duas regras que o serviço
-- impõe e que este comentário registra para quem ler o schema sozinho:
-- toda falha nasce com evidência, e quem encontrou nunca é quem aceita o risco.

-- CreateEnum
CREATE TYPE "GravidadeDaFalha" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'BLOQUEANTE');

-- CreateEnum
CREATE TYPE "SituacaoDaFalha" AS ENUM ('ABERTA', 'EM_TRATAMENTO', 'RESOLVIDA', 'ACEITA');

-- CreateTable
CREATE TABLE "delegacoes" (
    "id" TEXT NOT NULL,
    "dePositionId" TEXT NOT NULL,
    "paraPositionId" TEXT NOT NULL,
    "departmentId" TEXT,
    "objetivo" TEXT NOT NULL,
    "criterioDeAceite" TEXT,
    "prazo" TIMESTAMP(3),
    "workOrderId" TEXT,
    "taskId" TEXT,
    "pulouGerente" BOOLEAN NOT NULL DEFAULT false,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nao_conformidades" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "gravidade" "GravidadeDaFalha" NOT NULL,
    "situacao" "SituacaoDaFalha" NOT NULL DEFAULT 'ABERTA',
    "departmentId" TEXT,
    "agentProfileId" TEXT,
    "evidencia" JSONB NOT NULL DEFAULT '[]',
    "planoDeAcao" TEXT,
    "prazo" TIMESTAMP(3),
    "encontradaPorId" TEXT,
    "aceitaPorId" TEXT,
    "motivoDaAceite" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidaEm" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nao_conformidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delegacoes_departmentId_criadoEm_idx" ON "delegacoes"("departmentId", "criadoEm");

-- CreateIndex
CREATE INDEX "delegacoes_pulouGerente_criadoEm_idx" ON "delegacoes"("pulouGerente", "criadoEm");

-- CreateIndex
CREATE INDEX "delegacoes_paraPositionId_idx" ON "delegacoes"("paraPositionId");

-- CreateIndex
CREATE INDEX "nao_conformidades_situacao_gravidade_idx" ON "nao_conformidades"("situacao", "gravidade");

-- CreateIndex
CREATE INDEX "nao_conformidades_departmentId_criadaEm_idx" ON "nao_conformidades"("departmentId", "criadaEm");

-- CreateIndex
CREATE INDEX "nao_conformidades_agentProfileId_idx" ON "nao_conformidades"("agentProfileId");

-- AddForeignKey
ALTER TABLE "delegacoes" ADD CONSTRAINT "delegacoes_dePositionId_fkey" FOREIGN KEY ("dePositionId") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegacoes" ADD CONSTRAINT "delegacoes_paraPositionId_fkey" FOREIGN KEY ("paraPositionId") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegacoes" ADD CONSTRAINT "delegacoes_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegacoes" ADD CONSTRAINT "delegacoes_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegacoes" ADD CONSTRAINT "delegacoes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks_internas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_encontradaPorId_fkey" FOREIGN KEY ("encontradaPorId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_aceitaPorId_fkey" FOREIGN KEY ("aceitaPorId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

