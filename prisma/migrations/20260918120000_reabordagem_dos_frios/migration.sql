-- A REABORDAGEM DOS CONTATOS FRIOS — aditiva e idempotente.
--
-- Nada é apagado, nada é alterado. Duas tabelas novas: o interruptor de pânico
-- e a conta da campanha. `IF NOT EXISTS` em tudo, para poder rodar duas vezes.

CREATE TABLE IF NOT EXISTS "reabordagem_interruptor" (
  "id"           TEXT NOT NULL,
  "paradoEm"     TIMESTAMP(3),
  "motivo"       TEXT,
  "quemParou"    TEXT,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reabordagem_interruptor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reabordagem_execucao" (
  "id"               TEXT NOT NULL,
  "loteId"           TEXT NOT NULL,
  "leadId"           TEXT NOT NULL,
  "acao"             TEXT NOT NULL,
  "canal"            TEXT NOT NULL,
  "enviado"          BOOLEAN NOT NULL DEFAULT false,
  "mensagemId"       TEXT,
  "motivoDaRecusa"   TEXT,
  "detalhe"          TEXT,
  "decisorCapturado" BOOLEAN NOT NULL DEFAULT false,
  "leadDoDecisorId"  TEXT,
  "criadoEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reabordagem_execucao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reabordagem_execucao_loteId_leadId_key"
  ON "reabordagem_execucao"("loteId", "leadId");
CREATE INDEX IF NOT EXISTS "reabordagem_execucao_criadoEm_idx"
  ON "reabordagem_execucao"("criadoEm");
CREATE INDEX IF NOT EXISTS "reabordagem_execucao_acao_criadoEm_idx"
  ON "reabordagem_execucao"("acao", "criadoEm");
CREATE INDEX IF NOT EXISTS "reabordagem_execucao_loteId_idx"
  ON "reabordagem_execucao"("loteId");
