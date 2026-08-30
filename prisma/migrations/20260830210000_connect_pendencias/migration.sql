-- O livro de pendências do conector padrão do Dioli Connect.
-- Uma linha por consulta aberta; é o que liga o protocolo à conversa do cliente.
CREATE TABLE "connect_pendencias" (
    "id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "conversa" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "agente" TEXT NOT NULL,
    "fio" TEXT,
    "assunto" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDENTE',
    "avisadoEm" TIMESTAMP(3),
    "respondidaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connect_pendencias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connect_pendencias_protocolo_key" ON "connect_pendencias"("protocolo");
CREATE INDEX "connect_pendencias_conversa_estado_idx" ON "connect_pendencias"("conversa", "estado");
CREATE INDEX "connect_pendencias_estado_criadaEm_idx" ON "connect_pendencias"("estado", "criadaEm");
