-- O Centro de Treinamento não duplica conteúdo: registra o progresso e as
-- avaliações sobre as fontes aprovadas que já existem no Foocci.

CREATE TYPE "EixoDoTreinamentoComercial" AS ENUM (
  'PRODUTO',
  'VENDA_CONSULTIVA',
  'SEGURANCA_E_MARCA'
);

CREATE TYPE "OrigemDaAvaliacaoComercial" AS ENUM (
  'PROVA_HUMANA',
  'CENARIOS_DE_IA',
  'DESEMPENHO_REAL'
);

CREATE TABLE "treinamento_comercial_progressos" (
  "id" TEXT NOT NULL,
  "internalUserId" TEXT NOT NULL,
  "eixo" "EixoDoTreinamentoComercial" NOT NULL,
  "unidadeId" TEXT NOT NULL,
  "concluidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "treinamento_comercial_progressos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "treinamento_comercial_avaliacoes" (
  "id" TEXT NOT NULL,
  "internalUserId" TEXT NOT NULL,
  "eixo" "EixoDoTreinamentoComercial" NOT NULL,
  "origem" "OrigemDaAvaliacaoComercial" NOT NULL,
  "nota" INTEGER NOT NULL,
  "acertos" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "evidencia" JSONB,
  "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "treinamento_comercial_avaliacoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "treinamento_comercial_avaliacoes_nota_check" CHECK ("nota" BETWEEN 0 AND 100),
  CONSTRAINT "treinamento_comercial_avaliacoes_contagem_check" CHECK (
    "total" > 0 AND "acertos" >= 0 AND "acertos" <= "total"
  )
);

CREATE UNIQUE INDEX "treinamento_comercial_progressos_internalUserId_unidadeId_key"
  ON "treinamento_comercial_progressos"("internalUserId", "unidadeId");
CREATE INDEX "treinamento_comercial_progressos_internalUserId_eixo_idx"
  ON "treinamento_comercial_progressos"("internalUserId", "eixo");
CREATE INDEX "treinamento_comercial_avaliacoes_internalUserId_eixo_criadaEm_idx"
  ON "treinamento_comercial_avaliacoes"("internalUserId", "eixo", "criadaEm");

ALTER TABLE "treinamento_comercial_progressos"
  ADD CONSTRAINT "treinamento_comercial_progressos_internalUserId_fkey"
  FOREIGN KEY ("internalUserId") REFERENCES "internal_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "treinamento_comercial_avaliacoes"
  ADD CONSTRAINT "treinamento_comercial_avaliacoes_internalUserId_fkey"
  FOREIGN KEY ("internalUserId") REFERENCES "internal_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
