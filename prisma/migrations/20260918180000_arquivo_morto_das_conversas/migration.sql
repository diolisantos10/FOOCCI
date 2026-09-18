-- ARQUIVO MORTO DAS CONVERSAS
-- A cópia de leitura gravada antes da limpeza das conversas de atendimento.
-- Nenhuma chave estrangeira para site_leads de propósito: o arquivo precisa
-- sobreviver mesmo que a ficha do contato seja apagada depois.
CREATE TABLE IF NOT EXISTS "conversas_arquivadas" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "leadNome" TEXT,
    "leadWhatsapp" TEXT,
    "leadWhatsappDigits" TEXT,
    "leadCodigo" TEXT,
    "direcao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "autor" TEXT,
    "autorUserId" TEXT,
    "waMessageId" TEXT,
    "templateNome" TEXT,
    "texto" TEXT,
    "legenda" TEXT,
    "turnoId" TEXT,
    "papelDoAgente" TEXT,
    "origemDaFala" TEXT,
    "ocorreuEm" TIMESTAMP(3) NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL,
    "arquivadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loteDaLimpeza" TEXT NOT NULL,

    CONSTRAINT "conversas_arquivadas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "conversas_arquivadas_leadId_ocorreuEm_idx" ON "conversas_arquivadas"("leadId", "ocorreuEm");
CREATE INDEX IF NOT EXISTS "conversas_arquivadas_leadWhatsappDigits_ocorreuEm_idx" ON "conversas_arquivadas"("leadWhatsappDigits", "ocorreuEm");
CREATE INDEX IF NOT EXISTS "conversas_arquivadas_loteDaLimpeza_idx" ON "conversas_arquivadas"("loteDaLimpeza");
