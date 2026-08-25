-- Organização interna da Foocci — fundação compartilhada dos 9 departamentos.
-- Fase 1 de docs/arquitetura-operacional-foocci-v1/. Aditiva: nenhuma tabela
-- existente é alterada e nenhum dado é tocado.

-- CreateEnum
CREATE TYPE "InternalRole" AS ENUM ('CEO', 'DIRETOR', 'GERENTE_GERAL', 'GERENTE', 'MEMBRO', 'VIEWER', 'SYSTEM_AI');

-- CreateEnum
CREATE TYPE "PositionLevel" AS ENUM ('CEO', 'DIRETOR', 'GERENTE_GERAL', 'GERENTE', 'OPERACAO');

-- CreateEnum
CREATE TYPE "InternalActorType" AS ENUM ('INTERNAL_USER', 'LEGACY_ADMIN_SECRET', 'ANONIMO', 'SYSTEM');

-- CreateEnum
CREATE TYPE "InternalActionResult" AS ENUM ('PERMITIDO', 'NEGADO');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "missao" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "nivel" "PositionLevel" NOT NULL,
    "departmentId" TEXT,
    "reportsToPositionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "InternalRole" NOT NULL DEFAULT 'MEMBRO',
    "positionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_memberships" (
    "id" TEXT NOT NULL,
    "internalUserId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "positionId" TEXT,
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_audit_events" (
    "id" TEXT NOT NULL,
    "actorType" "InternalActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "resultado" "InternalActionResult" NOT NULL,
    "motivo" TEXT,
    "departmentId" TEXT,
    "origemIp" TEXT,
    "detalhe" JSONB NOT NULL DEFAULT '{}',
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_numero_key" ON "departments"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "departments_slug_key" ON "departments"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "positions_slug_key" ON "positions"("slug");

-- CreateIndex
CREATE INDEX "positions_departmentId_idx" ON "positions"("departmentId");

-- CreateIndex
CREATE INDEX "positions_reportsToPositionId_idx" ON "positions"("reportsToPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "internal_users_email_key" ON "internal_users"("email");

-- CreateIndex
CREATE INDEX "internal_users_role_idx" ON "internal_users"("role");

-- CreateIndex
CREATE INDEX "internal_users_positionId_idx" ON "internal_users"("positionId");

-- CreateIndex
CREATE INDEX "department_memberships_departmentId_isManager_idx" ON "department_memberships"("departmentId", "isManager");

-- CreateIndex
CREATE UNIQUE INDEX "department_memberships_internalUserId_departmentId_key" ON "department_memberships"("internalUserId", "departmentId");

-- CreateIndex
CREATE INDEX "internal_audit_events_ocorridoEm_idx" ON "internal_audit_events"("ocorridoEm");

-- CreateIndex
CREATE INDEX "internal_audit_events_actorType_ocorridoEm_idx" ON "internal_audit_events"("actorType", "ocorridoEm");

-- CreateIndex
CREATE INDEX "internal_audit_events_resultado_ocorridoEm_idx" ON "internal_audit_events"("resultado", "ocorridoEm");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_reportsToPositionId_fkey" FOREIGN KEY ("reportsToPositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_users" ADD CONSTRAINT "internal_users_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_internalUserId_fkey" FOREIGN KEY ("internalUserId") REFERENCES "internal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

