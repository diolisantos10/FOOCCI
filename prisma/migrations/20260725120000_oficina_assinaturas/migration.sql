-- Memória do anti-mesmice da Oficina.
-- Aditivo e seguro: tabela nova, nenhuma tabela existente é tocada.

CREATE TABLE "oficina_assinaturas" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "assinatura" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oficina_assinaturas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oficina_assinaturas_chave_assinatura_key"
  ON "oficina_assinaturas"("chave", "assinatura");

CREATE INDEX "oficina_assinaturas_chave_createdAt_idx"
  ON "oficina_assinaturas"("chave", "createdAt");
