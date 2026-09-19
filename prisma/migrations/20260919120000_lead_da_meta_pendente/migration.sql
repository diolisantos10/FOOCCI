-- Lead da Meta que chegou pelo webhook `leadgen` e ainda não pôde ser buscado
-- na Graph API. Aditiva: nenhuma tabela existente é tocada.
CREATE TABLE "meta_lead_pendentes" (
    "id" TEXT NOT NULL,
    "leadgenId" TEXT NOT NULL,
    "pageId" TEXT,
    "formId" TEXT,
    "criadoNaMeta" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimoErro" TEXT,
    "ultimaTentativaEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3),
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_lead_pendentes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_lead_pendentes_leadgenId_key" ON "meta_lead_pendentes"("leadgenId");
CREATE INDEX "meta_lead_pendentes_resolvidoEm_createdAt_idx" ON "meta_lead_pendentes"("resolvidoEm", "createdAt");
