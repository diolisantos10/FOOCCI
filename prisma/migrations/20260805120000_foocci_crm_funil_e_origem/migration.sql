-- CRM DA FOOCCI — funil, origem de verdade e histórico de contato.
--
-- Amplia a tabela SiteLead (que já existia como simples caixa de entrada do
-- formulário) para ser a BASE DE PROSPECTS da Foocci, e cria a linha do tempo
-- append-only que o agente SDR vai ler e escrever.
--
-- Toda coluna nova é nullable ou tem default: a migração não pode falhar por
-- causa das linhas que já estão em produção.

-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE "SiteLeadStage" AS ENUM ('NOVO', 'CONTATADO', 'QUALIFICADO', 'PROPOSTA', 'FECHADO', 'PERDIDO');

CREATE TYPE "SiteLeadSource" AS ENUM ('FORMULARIO_DEMONSTRACAO', 'AGENDAMENTO', 'WHATSAPP_DIRETO', 'INDICACAO', 'MANUAL', 'OUTRO');

CREATE TYPE "SiteLeadInteractionType" AS ENUM ('CAPTURA', 'REENVIO_FORMULARIO', 'MUDANCA_ETAPA', 'MENSAGEM_ENVIADA', 'RESPOSTA_RECEBIDA', 'LIGACAO', 'REUNIAO', 'NOTA');

-- ── SiteLead: origem de verdade + funil + porta de entrada ────────────────────
ALTER TABLE "SiteLead"
  ADD COLUMN "utmSource"         TEXT,
  ADD COLUMN "utmMedium"         TEXT,
  ADD COLUMN "utmCampaign"       TEXT,
  ADD COLUMN "utmContent"        TEXT,
  ADD COLUMN "utmTerm"           TEXT,
  ADD COLUMN "clickId"           TEXT,
  ADD COLUMN "landingPath"       TEXT,
  ADD COLUMN "referrer"          TEXT,
  ADD COLUMN "fonte"             "SiteLeadSource" NOT NULL DEFAULT 'FORMULARIO_DEMONSTRACAO',
  ADD COLUMN "whatsappDigits"    TEXT,
  ADD COLUMN "submissions"       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "stage"             "SiteLeadStage" NOT NULL DEFAULT 'NOVO',
  ADD COLUMN "stageChangedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "stageChangedBy"    TEXT,
  ADD COLUMN "lastContactedAt"   TIMESTAMP(3),
  ADD COLUMN "lastInteractionAt" TIMESTAMP(3);

-- Backfill honesto: o contato antigo entrou quando entrou, e ninguém o abordou.
-- `stageChangedAt = createdAt` evita que todo lead antigo pareça ter mudado de
-- etapa no dia do deploy — isso falsificaria o tempo de funil.
UPDATE "SiteLead" SET "stageChangedAt" = "createdAt";

-- whatsappDigits: só dígitos, com DDI 55 quando o número veio sem ele.
UPDATE "SiteLead"
SET "whatsappDigits" = CASE
  WHEN regexp_replace("whatsapp", '\D', '', 'g') = ''        THEN NULL
  WHEN regexp_replace("whatsapp", '\D', '', 'g') LIKE '55%'  THEN regexp_replace("whatsapp", '\D', '', 'g')
  ELSE '55' || regexp_replace("whatsapp", '\D', '', 'g')
END;

-- ── SiteLeadInteraction — a linha do tempo append-only ────────────────────────
CREATE TABLE "SiteLeadInteraction" (
    "id"        TEXT NOT NULL,
    "leadId"    TEXT NOT NULL,
    "tipo"      "SiteLeadInteractionType" NOT NULL,
    "fromStage" "SiteLeadStage",
    "toStage"   "SiteLeadStage",
    "actor"     TEXT NOT NULL,
    "nota"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteLeadInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteLeadInteraction_leadId_createdAt_idx" ON "SiteLeadInteraction"("leadId", "createdAt");
CREATE INDEX "SiteLeadInteraction_createdAt_idx"        ON "SiteLeadInteraction"("createdAt");
CREATE INDEX "SiteLeadInteraction_tipo_createdAt_idx"   ON "SiteLeadInteraction"("tipo", "createdAt");

ALTER TABLE "SiteLeadInteraction"
  ADD CONSTRAINT "SiteLeadInteraction_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Todo contato que já existia ganha seu evento de CAPTURA, datado de quando ele
-- realmente chegou. Sem isso a linha do tempo começaria vazia e pareceria que os
-- contatos antigos nasceram do nada.
INSERT INTO "SiteLeadInteraction" ("id", "leadId", "tipo", "toStage", "actor", "nota", "createdAt")
SELECT
  'slic_' || "id",
  "id",
  'CAPTURA',
  'NOVO',
  'sistema',
  'Contato já existente quando o CRM da Foocci foi criado.',
  "createdAt"
FROM "SiteLead";

UPDATE "SiteLead" SET "lastInteractionAt" = "createdAt";

-- ── Índices novos do SiteLead ─────────────────────────────────────────────────
CREATE INDEX "SiteLead_stage_createdAt_idx"  ON "SiteLead"("stage", "createdAt");
CREATE INDEX "SiteLead_utmCampaign_idx"      ON "SiteLead"("utmCampaign");
CREATE INDEX "SiteLead_whatsappDigits_idx"   ON "SiteLead"("whatsappDigits");
CREATE INDEX "SiteLead_lastContactedAt_idx"  ON "SiteLead"("lastContactedAt");
