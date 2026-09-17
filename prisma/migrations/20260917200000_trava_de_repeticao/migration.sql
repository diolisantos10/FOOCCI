-- ═══════════════════════════════════════════════════════════════════════════
-- A TRAVA DE REPETIÇÃO — 17/09/2026
--
-- ⚠️ ADITIVA E IDEMPOTENTE. Nenhum DROP, nenhum RENAME, nenhuma coluna
-- existente tocada. Rodar duas vezes não quebra e não duplica.
--
-- Três tabelas novas, e o `@@unique` da segunda é a trava de verdade: é o
-- Postgres que recusa a segunda gravação do mesmo conteúdo para o mesmo
-- número, e não um `if` no código — que é exatamente o que permitiu a corrida.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "trava_abordagem_ritmo" (
  "telefoneDigits" TEXT NOT NULL,
  "ultimoEnvioEm"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "trava_abordagem_ritmo_pkey" PRIMARY KEY ("telefoneDigits")
);

CREATE TABLE IF NOT EXISTS "trava_abordagem_enviada" (
  "id"             TEXT NOT NULL,
  "telefoneDigits" TEXT NOT NULL,
  "impressao"      TEXT NOT NULL,
  "leadId"         TEXT,
  "origem"         TEXT NOT NULL,
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trava_abordagem_enviada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trava_abordagem_enviada_telefoneDigits_impressao_key"
  ON "trava_abordagem_enviada" ("telefoneDigits", "impressao");

CREATE INDEX IF NOT EXISTS "trava_abordagem_enviada_telefoneDigits_criadoEm_idx"
  ON "trava_abordagem_enviada" ("telefoneDigits", "criadoEm");

CREATE TABLE IF NOT EXISTS "trava_abordagem_recusa" (
  "id"             TEXT NOT NULL,
  "telefoneDigits" TEXT NOT NULL,
  "impressao"      TEXT NOT NULL,
  "leadId"         TEXT,
  "origem"         TEXT NOT NULL,
  "motivo"         TEXT NOT NULL,
  "detalhe"        TEXT NOT NULL,
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trava_abordagem_recusa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trava_abordagem_recusa_criadoEm_idx"
  ON "trava_abordagem_recusa" ("criadoEm");
CREATE INDEX IF NOT EXISTS "trava_abordagem_recusa_telefoneDigits_criadoEm_idx"
  ON "trava_abordagem_recusa" ("telefoneDigits", "criadoEm");
CREATE INDEX IF NOT EXISTS "trava_abordagem_recusa_motivo_criadoEm_idx"
  ON "trava_abordagem_recusa" ("motivo", "criadoEm");
