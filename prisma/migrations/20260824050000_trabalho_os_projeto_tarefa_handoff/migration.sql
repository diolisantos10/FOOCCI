-- O trabalho da empresa: OS, projeto, tarefa, dependência, handoff e a linha do
-- tempo imutável (documento 09, seções 3.2 e 3.4).
--
-- Seis tabelas novas, três tipos novos. Zero DROP, zero ALTER em tabela
-- existente: nada do que já roda é tocado.
--
-- No fim do arquivo há a trava de append-only da linha do tempo. Ela é gatilho
-- no banco, e não convenção de código, porque "timeline imutável" escrito num
-- comentário é uma promessa; escrito num gatilho é um fato.

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkPriority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('ENVIADO', 'ACEITO', 'RECUSADO', 'DEVOLVIDO');

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "objetivo" TEXT NOT NULL,
    "resultadoEsperado" TEXT NOT NULL,
    "criterioDeAceite" TEXT NOT NULL,
    "contexto" TEXT,
    "riscos" TEXT,
    "restricoes" TEXT,
    "prioridade" "WorkPriority" NOT NULL DEFAULT 'MEDIA',
    "status" "WorkStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "prazo" TIMESTAMP(3),
    "solicitanteId" TEXT,
    "sponsorPositionId" TEXT,
    "ownerPositionId" TEXT,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects_internos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "prioridade" "WorkPriority" NOT NULL DEFAULT 'MEDIA',
    "prazo" TIMESTAMP(3),
    "workOrderId" TEXT,
    "departmentId" TEXT,
    "ownerPositionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_internos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks_internas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "WorkStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "prioridade" "WorkPriority" NOT NULL DEFAULT 'MEDIA',
    "prazo" TIMESTAMP(3),
    "assigneePositionId" TEXT,
    "assigneeUserId" TEXT,
    "projectId" TEXT,
    "workOrderId" TEXT,
    "departmentId" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_internas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoffs" (
    "id" TEXT NOT NULL,
    "origemDepartmentId" TEXT NOT NULL,
    "destinoDepartmentId" TEXT NOT NULL,
    "responsavelPositionId" TEXT,
    "resumo" TEXT NOT NULL,
    "evidencias" JSONB NOT NULL DEFAULT '[]',
    "entregaveis" JSONB NOT NULL DEFAULT '[]',
    "pendencias" JSONB NOT NULL DEFAULT '[]',
    "slaHoras" INTEGER,
    "status" "HandoffStatus" NOT NULL DEFAULT 'ENVIADO',
    "workOrderId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "enviadoPorId" TEXT,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aceitoPorId" TEXT,
    "aceitoEm" TIMESTAMP(3),
    "recusadoEm" TIMESTAMP(3),
    "motivo" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "atorTipo" TEXT NOT NULL,
    "atorRotulo" TEXT,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_numero_key" ON "work_orders"("numero");

-- CreateIndex
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");

-- CreateIndex
CREATE INDEX "work_orders_departmentId_idx" ON "work_orders"("departmentId");

-- CreateIndex
CREATE INDEX "work_orders_ownerPositionId_idx" ON "work_orders"("ownerPositionId");

-- CreateIndex
CREATE INDEX "projects_internos_status_idx" ON "projects_internos"("status");

-- CreateIndex
CREATE INDEX "projects_internos_workOrderId_idx" ON "projects_internos"("workOrderId");

-- CreateIndex
CREATE INDEX "projects_internos_departmentId_idx" ON "projects_internos"("departmentId");

-- CreateIndex
CREATE INDEX "tasks_internas_status_idx" ON "tasks_internas"("status");

-- CreateIndex
CREATE INDEX "tasks_internas_projectId_idx" ON "tasks_internas"("projectId");

-- CreateIndex
CREATE INDEX "tasks_internas_assigneePositionId_idx" ON "tasks_internas"("assigneePositionId");

-- CreateIndex
CREATE INDEX "tasks_internas_assigneeUserId_idx" ON "tasks_internas"("assigneeUserId");

-- CreateIndex
CREATE INDEX "task_dependencies_dependsOnTaskId_idx" ON "task_dependencies"("dependsOnTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_taskId_dependsOnTaskId_key" ON "task_dependencies"("taskId", "dependsOnTaskId");

-- CreateIndex
CREATE INDEX "handoffs_status_idx" ON "handoffs"("status");

-- CreateIndex
CREATE INDEX "handoffs_destinoDepartmentId_status_idx" ON "handoffs"("destinoDepartmentId", "status");

-- CreateIndex
CREATE INDEX "handoffs_taskId_idx" ON "handoffs"("taskId");

-- CreateIndex
CREATE INDEX "domain_events_entidade_entidadeId_ocorridoEm_idx" ON "domain_events"("entidade", "entidadeId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "domain_events_tipo_ocorridoEm_idx" ON "domain_events"("tipo", "ocorridoEm");

-- CreateIndex
CREATE INDEX "domain_events_ocorridoEm_idx" ON "domain_events"("ocorridoEm");

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_sponsorPositionId_fkey" FOREIGN KEY ("sponsorPositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_ownerPositionId_fkey" FOREIGN KEY ("ownerPositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects_internos" ADD CONSTRAINT "projects_internos_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects_internos" ADD CONSTRAINT "projects_internos_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects_internos" ADD CONSTRAINT "projects_internos_ownerPositionId_fkey" FOREIGN KEY ("ownerPositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_internas" ADD CONSTRAINT "tasks_internas_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects_internos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_internas" ADD CONSTRAINT "tasks_internas_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_internas" ADD CONSTRAINT "tasks_internas_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_internas" ADD CONSTRAINT "tasks_internas_assigneePositionId_fkey" FOREIGN KEY ("assigneePositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks_internas" ADD CONSTRAINT "tasks_internas_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks_internas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependsOnTaskId_fkey" FOREIGN KEY ("dependsOnTaskId") REFERENCES "tasks_internas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_origemDepartmentId_fkey" FOREIGN KEY ("origemDepartmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_destinoDepartmentId_fkey" FOREIGN KEY ("destinoDepartmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_responsavelPositionId_fkey" FOREIGN KEY ("responsavelPositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects_internos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks_internas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_aceitoPorId_fkey" FOREIGN KEY ("aceitoPorId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════════
-- A LINHA DO TEMPO É IMUTÁVEL — E ISTO É O QUE TORNA ISSO VERDADE
--
-- O documento 09 exige "timeline imutável". Um comentário no schema não impede
-- ninguém de rodar um UPDATE; este gatilho impede.
--
-- A escolha de `insufficient_privilege` como código de erro é deliberada: quem
-- receber esse erro numa madrugada entende, sem ler documentação, que não foi um
-- bug — foi uma recusa.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION domain_events_somente_insercao()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'domain_events e append-only: % nao e permitido. Um evento registra o que aconteceu; corrigir o passado seria reescrever a historia, nao consertar o dado. Registre um evento NOVO.',
    TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER domain_events_sem_update
  BEFORE UPDATE ON "domain_events"
  FOR EACH ROW EXECUTE FUNCTION domain_events_somente_insercao();

CREATE TRIGGER domain_events_sem_delete
  BEFORE DELETE ON "domain_events"
  FOR EACH ROW EXECUTE FUNCTION domain_events_somente_insercao();
