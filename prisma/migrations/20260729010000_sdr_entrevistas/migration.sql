-- SDR — a entrevista de sondagem guardada entre um turno e outro.
--
-- Aditiva: cria uma tabela nova e não toca em nenhuma existente.
--
-- `perguntadas` é a coluna que carrega a regra da casa: falta de RESPOSTA não
-- trava a proposta, falta de PERGUNTA trava. Ela registra o que a agência
-- perguntou, não o que o cliente respondeu.

CREATE TABLE IF NOT EXISTS "sdr_entrevistas" (
    "id"          TEXT NOT NULL,
    "chave"       TEXT NOT NULL,
    "ficha"       JSONB NOT NULL DEFAULT '{}',
    "perguntadas" JSONB NOT NULL DEFAULT '[]',
    "servicos"    JSONB NOT NULL DEFAULT '[]',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sdr_entrevistas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sdr_entrevistas_chave_key" ON "sdr_entrevistas"("chave");
CREATE INDEX IF NOT EXISTS "sdr_entrevistas_updatedAt_idx" ON "sdr_entrevistas"("updatedAt");
