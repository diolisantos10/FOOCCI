-- Prospecção (Jornada 3) — lotes, itens e o interruptor.
--
-- As origens multicanal entram na migration anterior, sozinhas: ADD VALUE de
-- enum e CREATE TABLE na mesma transação é aposta na versão do PostgreSQL.
--
-- Tudo aqui é ADITIVO: três tabelas novas. Nenhuma
-- coluna existente muda de tipo, nenhuma linha é apagada, nada é renomeado.
-- Uma base já em produção aceita esta migration sem perder nada.

-- ── Os estados do lote e do item ────────────────────────────────────────────
CREATE TYPE "SituacaoDoLote" AS ENUM ('RASCUNHO', 'LIBERADO', 'PAUSADO', 'ENCERRADO');
CREATE TYPE "SituacaoDoItem" AS ENUM ('PENDENTE', 'VIROU_LEAD', 'DUPLICADO', 'RECUSADO');

-- ── O interruptor da prospecção ─────────────────────────────────────────────
-- Nasce desligado e com teto zero: ligar é ato explícito de quem responde pela
-- marca, não estado padrão de quem esqueceu de configurar.
CREATE TABLE "prospeccao_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "outboundLigado" BOOLEAN NOT NULL DEFAULT false,
    "limiteDiario" INTEGER NOT NULL DEFAULT 0,
    "horasEntreAbordagens" INTEGER NOT NULL DEFAULT 72,
    "pausadoEm" TIMESTAMP(3),
    "pausadoPor" TEXT,
    "motivo" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT,

    CONSTRAINT "prospeccao_config_pkey" PRIMARY KEY ("id")
);

-- ── Os lotes ────────────────────────────────────────────────────────────────
CREATE TABLE "lotes_de_prospeccao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "proveniencia" TEXT NOT NULL,
    "situacao" "SituacaoDoLote" NOT NULL DEFAULT 'RASCUNHO',
    "limiteDiario" INTEGER NOT NULL DEFAULT 20,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liberadoEm" TIMESTAMP(3),
    "liberadoPor" TEXT,
    "pausadoEm" TIMESTAMP(3),
    "pausadoPor" TEXT,
    "encerradoEm" TIMESTAMP(3),

    CONSTRAINT "lotes_de_prospeccao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lotes_de_prospeccao_situacao_criadoEm_idx" ON "lotes_de_prospeccao"("situacao", "criadoEm");

-- ── Os itens ────────────────────────────────────────────────────────────────
CREATE TABLE "itens_de_prospeccao" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "nome" TEXT,
    "whatsapp" TEXT NOT NULL,
    "whatsappDigits" TEXT NOT NULL,
    "empresa" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "tipo" TEXT,
    "situacao" "SituacaoDoItem" NOT NULL DEFAULT 'PENDENTE',
    "leadId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),

    CONSTRAINT "itens_de_prospeccao_pkey" PRIMARY KEY ("id")
);

-- O mesmo telefone não entra duas vezes no mesmo lote. É trava de banco, não
-- promessa de código: quem importar a mesma planilha duas vezes não duplica.
CREATE UNIQUE INDEX "itens_de_prospeccao_loteId_whatsappDigits_key" ON "itens_de_prospeccao"("loteId", "whatsappDigits");
CREATE INDEX "itens_de_prospeccao_situacao_idx" ON "itens_de_prospeccao"("situacao");
CREATE INDEX "itens_de_prospeccao_whatsappDigits_idx" ON "itens_de_prospeccao"("whatsappDigits");

ALTER TABLE "itens_de_prospeccao" ADD CONSTRAINT "itens_de_prospeccao_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_de_prospeccao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
