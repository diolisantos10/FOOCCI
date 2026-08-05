-- Raio-X noturno — a coleta determinística do sistema.
--
-- Por que existe: uma varredura por madrugada que produz EVIDÊNCIA (números,
-- identificadores, casos concretos) para a leitura de negócio da manhã. A coleta
-- não usa IA de propósito — coleta que erra diferente toda noite não permite
-- dizer "piorou desde ontem", e a comparação é metade do valor.
--
-- Três decisões que as tabelas sustentam por construção:
--   1. `globalStatus` admite UNKNOWN. Sonda que não conseguiu olhar não vira
--      PASS; ausência de dado não é informação.
--   2. `deltas` mora no achado, não na execução: o conjunto de sondas muda com o
--      tempo e a comparação precisa sobreviver a isso. `null` numa chave
--      significa "sem base de comparação" — e não zero, que seria "estável".
--   3. `unavailableBlocks` guarda o que a coleta NÃO conseguiu ler, com motivo.
--      O relatório da manhã precisa poder dizer o que não sabe.
--
-- Aditiva: tabelas novas, nada existente muda. Nenhuma FK para dado de negócio.

CREATE TABLE IF NOT EXISTS "raiox_runs" (
    "id"                TEXT         NOT NULL,
    "source"            TEXT         NOT NULL DEFAULT 'CRON',   -- CRON | MANUAL
    "globalStatus"      TEXT         NOT NULL,                  -- PASS | WARNING | FAIL | UNKNOWN
    "startedAt"         TIMESTAMP(3) NOT NULL,
    "finishedAt"        TIMESTAMP(3) NOT NULL,
    "durationMs"        INTEGER      NOT NULL,
    "triggeredBy"       TEXT,
    "countsByStatus"    JSONB        NOT NULL,
    "countsBySeverity"  JSONB        NOT NULL,
    "comparedToRunId"   TEXT,
    "unavailableBlocks" JSONB,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raiox_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "raiox_runs_createdAt_idx"    ON "raiox_runs" ("createdAt");
CREATE INDEX IF NOT EXISTS "raiox_runs_globalStatus_idx" ON "raiox_runs" ("globalStatus");

CREATE TABLE IF NOT EXISTS "raiox_findings" (
    "id"             TEXT         NOT NULL,
    "runId"          TEXT         NOT NULL,
    "probeId"        TEXT         NOT NULL,
    "area"           TEXT         NOT NULL,
    "status"         TEXT         NOT NULL,   -- PASS | WARNING | FAIL | UNKNOWN
    "severity"       TEXT         NOT NULL,   -- P0 | P1 | P2 | INFO
    "title"          TEXT         NOT NULL,
    "summary"        TEXT         NOT NULL,
    "evidence"       JSONB        NOT NULL,   -- string[] já sanitizado
    "metrics"        JSONB        NOT NULL,
    "deltas"         JSONB        NOT NULL,
    "recommendation" TEXT         NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raiox_findings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "raiox_findings_runId_idx"            ON "raiox_findings" ("runId");
CREATE INDEX IF NOT EXISTS "raiox_findings_probeId_severity_idx" ON "raiox_findings" ("probeId", "severity");

ALTER TABLE "raiox_findings"
    DROP CONSTRAINT IF EXISTS "raiox_findings_runId_fkey";
ALTER TABLE "raiox_findings"
    ADD CONSTRAINT "raiox_findings_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "raiox_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
