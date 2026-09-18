-- A CONTA DO DIA: o degrau que até hoje não deixava rastro nenhum.
--
-- Quem é cortado ANTES de virar linha em `campaign_executions` — o excedente do
-- teto por rodada (`batchCap`) — não era gravado em lugar nenhum. Sem ele a
-- conta "enviados + barrados = elegíveis" NUNCA fecha, e degrau escondido é
-- exatamente onde os 2.396 elegíveis morreram.
--
-- ADITIVA e IDEMPOTENTE: só cria. Não altera, não apaga, não renomeia nada.

CREATE TABLE IF NOT EXISTS "crm_ciclo_funil" (
    "id"            TEXT NOT NULL,
    "restaurantId"  TEXT NOT NULL,
    "campaignId"    TEXT NOT NULL,
    "ocorridoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Quantos sobreviveram a TODAS as exclusões e foram oferecidos a este ciclo.
    "elegiveis"     INTEGER NOT NULL,
    -- Quantos entraram no lote de fato enviado (cada um vira linha em campaign_executions).
    "noLote"        INTEGER NOT NULL,
    -- elegiveis - noLote: o grupo que some sem deixar rastro. Agora tem rastro.
    "cortados"      INTEGER NOT NULL,
    -- Qual teto cortou: TETO_DA_RODADA / LIMITE_DIARIO_DA_CAMPANHA / ORCAMENTO_DO_CICLO.
    "motivoDoCorte" TEXT,
    -- O teto por rodada aplicado, para a conta poder ser refeita depois.
    "tetoDaRodada"  INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "crm_ciclo_funil_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "crm_ciclo_funil_restaurantId_ocorridoEm_idx"
    ON "crm_ciclo_funil"("restaurantId", "ocorridoEm");

CREATE INDEX IF NOT EXISTS "crm_ciclo_funil_campaignId_ocorridoEm_idx"
    ON "crm_ciclo_funil"("campaignId", "ocorridoEm");
