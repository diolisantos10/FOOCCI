-- Dois defeitos que faziam o sistema mentir em silêncio depois de uma troca de número.
--
-- 1) MENSAGEM DE CLIENTE SUMINDO NUM LOG
-- A Meta entrega o webhook com um `phone_number_id`. Quando nenhum restaurante
-- reconhece esse id, a mensagem era descartada num `console.warn` que a retenção do
-- Railway apaga no deploy seguinte. Em 12/08/2026 um restaurante trocou de chip, o
-- id gravado seguiu apontando para o número velho e toda mensagem que entrava sumia
-- ali — com a tela verde o tempo todo. O CEO descobriu pelas vendas, no dia seguinte.
--
-- A tabela é AGREGADA POR NÚMERO de propósito: uma linha por `phone_number_id`, com
-- contador. Enxurrada incrementa um inteiro em vez de criar linha nova — o teto de
-- volume está na forma da tabela, não numa regra que alguém pode esquecer.
--
-- Sem `restaurantId`, sem conteúdo de mensagem e sem telefone de cliente em claro:
-- sem dono conhecido, atribuir a alguém seria vazamento entre inquilinos.
CREATE TABLE "meta_unrouted_inbound" (
    "id"                 TEXT         NOT NULL,
    "phoneNumberId"      TEXT         NOT NULL,
    "displayPhoneNumber" TEXT,
    "messageCount"       INTEGER      NOT NULL DEFAULT 0,
    "firstSeenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMaskedFrom"     TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_unrouted_inbound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_unrouted_inbound_phoneNumberId_key" ON "meta_unrouted_inbound"("phoneNumberId");
CREATE INDEX "meta_unrouted_inbound_lastSeenAt_idx" ON "meta_unrouted_inbound"("lastSeenAt");

-- 2) MODELO FANTASMA
-- `syncFromMeta` só fazia `upsert` e nunca invalidava. Um modelo aprovado na WABA
-- ANTIGA continuava marcado APPROVED para sempre depois da troca de conta — e o
-- envio o escolhia, e a Meta rejeitava, porque o nome não existe na WABA de hoje.
--
-- NULO = existe na conta atual. Preenchido = órfão, veio de outra conta.
-- É marcação, NUNCA exclusão: apagar perderia a perícia de "isto já foi aprovado",
-- e um modelo pode sumir da resposta por falha de rede — apagar por causa de uma
-- leitura que falhou seria a proteção mais destrutiva que o problema.
ALTER TABLE "meta_message_templates" ADD COLUMN "orphanedAt" TIMESTAMP(3);
