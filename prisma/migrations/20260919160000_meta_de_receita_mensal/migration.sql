-- A META DE RECEITA DO COMERCIAL — um valor POR MÊS, com quem decidiu e quando.
--
-- Aditiva: cria duas tabelas novas e não toca em nenhuma existente.
--
-- Por que a chave é a competência e não um `singleton`: com um valor único,
-- trocar a meta de outubro reescreveria o "% da meta" de setembro, depois do
-- mês fechado. Percentual que muda para trás não é medição.

CREATE TABLE "meta_de_receita_mensal" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "definidoPorId" TEXT,
    "definidoPorNome" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_de_receita_mensal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_de_receita_mensal_competencia_key" ON "meta_de_receita_mensal"("competencia");

CREATE TABLE "meta_de_receita_historico" (
    "id" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valorAnteriorCentavos" INTEGER,
    "valorNovoCentavos" INTEGER NOT NULL,
    "alteradoPorId" TEXT,
    "alteradoPorNome" TEXT NOT NULL,
    "motivo" TEXT,
    "alteradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_de_receita_historico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meta_de_receita_historico_competencia_alteradoEm_idx" ON "meta_de_receita_historico"("competencia", "alteradoEm");

ALTER TABLE "meta_de_receita_historico"
  ADD CONSTRAINT "meta_de_receita_historico_metaId_fkey"
  FOREIGN KEY ("metaId") REFERENCES "meta_de_receita_mensal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── A SEMENTE: a decisão do CEO de 19/09/2026 ──────────────────────────────
--
-- "A meta de receita do comercial da Foocci é R$ 100.000 por mês."
--
-- Semeada aqui, e não num script à parte, porque a meta corrente É a decisão:
-- um script que alguém pode esquecer de rodar deixaria a tela 13 dizendo "sem
-- meta" num mês em que o CEO já tinha decidido. `ON CONFLICT DO NOTHING` para
-- que um banco que já tenha a competência não seja sobrescrito pela migração.
INSERT INTO "meta_de_receita_mensal"
  ("id", "competencia", "valorCentavos", "definidoPorId", "definidoPorNome", "criadaEm", "atualizadoEm")
VALUES
  ('meta-receita-2026-09', '2026-09', 10000000, NULL, 'CEO (decisão de 19/09/2026)', '2026-09-19 00:00:00', '2026-09-19 00:00:00')
ON CONFLICT ("competencia") DO NOTHING;

INSERT INTO "meta_de_receita_historico"
  ("id", "metaId", "competencia", "valorAnteriorCentavos", "valorNovoCentavos", "alteradoPorId", "alteradoPorNome", "motivo", "alteradoEm")
SELECT
  'meta-receita-hist-2026-09', 'meta-receita-2026-09', '2026-09', NULL, 10000000, NULL,
  'CEO (decisão de 19/09/2026)', 'Primeira meta do comercial da Foocci, decidida pelo CEO em 19/09/2026.',
  '2026-09-19 00:00:00'
WHERE EXISTS (SELECT 1 FROM "meta_de_receita_mensal" WHERE "id" = 'meta-receita-2026-09');
