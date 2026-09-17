-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO B1 — A JORNADA COMERCIAL
-- EMPRESA → CONTATO → DECISOR → LEAD → OPORTUNIDADE → CLIENTE
--
-- A decisão do documento (`reestruturação da área comercial do FOOCCI`) é que
-- Hunter, SDR, Vendedor e CRM NÃO são quatro bancos: é um registro só evoluindo.
-- Faltavam quatro entidades — Empresa, Contato/Decisor, Oportunidade e Cliente —
-- e a palavra "decisor" não existia neste banco.
--
-- ⚠️ ESTA MIGRAÇÃO É ADITIVA, E ISSO NÃO É ESTILO: É ORDEM.
--
-- Há lead de cliente REAL no funil agora. Empilhar, não substituir.
--   • nenhum DROP, de tabela, coluna, índice ou tipo;
--   • nenhum RENAME;
--   • nenhum NOT NULL acrescentado a coluna existente;
--   • `SiteLead` ganha DUAS colunas, as duas NULLABLE e sem default —
--     lead sem empresa (Meta Ads, site, WhatsApp direto) continua idêntico.
--
-- ⚠️ ELA APLICA EM BANCO VAZIO **E** SOBRE O SCHEMA ATUAL.
--
-- Todo objeto é criado sob guarda (`IF NOT EXISTS`, ou bloco `DO $$` contra o
-- catálogo quando o Postgres não oferece a cláusula — tipo enumerado e chave
-- estrangeira). Rodar duas vezes não quebra e não duplica. Migração que só
-- funciona a partir de um estado é migração que só funciona uma vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstagioDaEmpresa') THEN
    CREATE TYPE "EstagioDaEmpresa" AS ENUM ('DESCOBERTA', 'ENRIQUECENDO', 'PRONTA_PARA_SDR', 'GATEKEEPER', 'DECISOR_ENCONTRADO', 'QUALIFICADA', 'DESCARTADA');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrioridadeDaEmpresa') THEN
    CREATE TYPE "PrioridadeDaEmpresa" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoDeGatekeeper') THEN
    CREATE TYPE "TipoDeGatekeeper" AS ENUM ('BOT_DE_PEDIDOS', 'RECEPCIONISTA', 'ATENDENTE', 'SAC', 'CAIXA', 'FORMULARIO', 'WHATSAPP_GERAL', 'CENTRAL_TELEFONICA', 'OUTRO');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConfiancaDaInformacao') THEN
    CREATE TYPE "ConfiancaDaInformacao" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstagioDaOportunidade') THEN
    CREATE TYPE "EstagioDaOportunidade" AS ENUM ('DESCOBERTA', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'GANHA', 'PERDIDA');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SituacaoDoCliente') THEN
    CREATE TYPE "SituacaoDoCliente" AS ENUM ('EM_ATIVACAO', 'ATIVO', 'EM_RISCO', 'INATIVO', 'CANCELADO');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EntidadeDaJornada') THEN
    CREATE TYPE "EntidadeDaJornada" AS ENUM ('EMPRESA', 'CONTATO', 'OPORTUNIDADE', 'CLIENTE');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoDeEventoDaJornada') THEN
    CREATE TYPE "TipoDeEventoDaJornada" AS ENUM ('CRIACAO', 'MUDANCA_DE_ESTAGIO', 'ENRIQUECIMENTO', 'VINCULO', 'GATEKEEPER_IDENTIFICADO', 'DECISOR_ENCONTRADO', 'SCORE_CALCULADO', 'NOTA');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "contatoId" TEXT,
ADD COLUMN IF NOT EXISTS "empresaId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "empresas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chaveDeDedupe" TEXT NOT NULL,
    "categoria" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "bairro" TEXT,
    "endereco" TEXT,
    "cep" TEXT,
    "cnpj" TEXT,
    "site" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "whatsappPublicado" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "googleMapsUrl" TEXT,
    "deliveryProprio" BOOLEAN,
    "marketplaces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "apuradoMarketplaceEm" TIMESTAMP(3),
    "cardapioProprio" BOOLEAN,
    "numeroDeUnidades" INTEGER,
    "sistemaIdentificado" TEXT,
    "ticketEstimadoCents" INTEGER,
    "scoreIcp" INTEGER,
    "scoreIcpEm" TIMESTAMP(3),
    "reguaVersao" INTEGER,
    "prioridade" "PrioridadeDaEmpresa",
    "estagio" "EstagioDaEmpresa" NOT NULL DEFAULT 'DESCOBERTA',
    "estagioMudouEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estagioMudouPor" TEXT,
    "motivoDoDescarte" TEXT,
    "fonteDaDescoberta" TEXT NOT NULL,
    "descobertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descobertaPorAutor" "AutorDaMensagem" NOT NULL DEFAULT 'SISTEMA',
    "descobertaPorUserId" TEXT,
    "loteDeProspeccaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "empresa_fatores_icp" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fator" TEXT NOT NULL,
    "observado" TEXT NOT NULL,
    "pontos" INTEGER NOT NULL,
    "reguaVersao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_fatores_icp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "empresa_proveniencias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valor" TEXT,
    "fonte" TEXT NOT NULL,
    "url" TEXT,
    "confianca" "ConfiancaDaInformacao" NOT NULL DEFAULT 'MEDIA',
    "coletadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coletadoPorAutor" "AutorDaMensagem" NOT NULL DEFAULT 'SISTEMA',
    "coletadoPorUserId" TEXT,

    CONSTRAINT "empresa_proveniencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contatos_de_empresa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "canal" TEXT,
    "telefone" TEXT,
    "telefoneDigits" TEXT,
    "email" TEXT,
    "ehDecisor" BOOLEAN NOT NULL DEFAULT false,
    "ehGatekeeper" BOOLEAN NOT NULL DEFAULT false,
    "tipoDeGatekeeper" "TipoDeGatekeeper",
    "confianca" "ConfiancaDaInformacao" NOT NULL DEFAULT 'MEDIA',
    "comoFoiDescoberto" TEXT,
    "fonte" TEXT,
    "consentimentoEm" TIMESTAMP(3),
    "consentimentoCanal" TEXT,
    "consentimentoPolitica" TEXT,
    "optOutEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorAutor" "AutorDaMensagem" NOT NULL DEFAULT 'SISTEMA',
    "criadoPorUserId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contatos_de_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "oportunidades" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "contatoDecisorId" TEXT,
    "leadId" TEXT,
    "chaveDeOrigem" TEXT,
    "valorPotencialCents" INTEGER,
    "produtoDeInteresse" TEXT,
    "estagio" "EstagioDaOportunidade" NOT NULL DEFAULT 'DESCOBERTA',
    "estagioMudouEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estagioMudouPor" TEXT,
    "probabilidade" INTEGER,
    "dorIdentificada" TEXT,
    "objecoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "motivoPerdaId" TEXT,
    "motivoPerdaDetalhe" TEXT,
    "previsaoDeFechamento" TIMESTAMP(3),
    "fechadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorAutor" "AutorDaMensagem" NOT NULL DEFAULT 'SISTEMA',
    "criadoPorUserId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "clientes_comerciais" (
    "id" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "restaurantId" TEXT,
    "situacao" "SituacaoDoCliente" NOT NULL DEFAULT 'EM_ATIVACAO',
    "situacaoMudouEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "situacaoMudouPor" TEXT,
    "ganhoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ativadoEm" TIMESTAMP(3),
    "passosDeAtivacao" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "saude" INTEGER,
    "saudeEm" TIMESTAMP(3),
    "nps" INTEGER,
    "npsEm" TIMESTAMP(3),
    "riscoDeChurn" INTEGER,
    "motivoDoRisco" TEXT,
    "ultimaCompraEm" TIMESTAMP(3),
    "recompras" INTEGER NOT NULL DEFAULT 0,
    "upsells" INTEGER NOT NULL DEFAULT 0,
    "receitaTotalCents" INTEGER NOT NULL DEFAULT 0,
    "canceladoEm" TIMESTAMP(3),
    "motivoDoCancelamento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_comerciais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "jornada_eventos" (
    "id" TEXT NOT NULL,
    "entidade" "EntidadeDaJornada" NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "empresaId" TEXT,
    "contatoId" TEXT,
    "oportunidadeId" TEXT,
    "clienteId" TEXT,
    "leadId" TEXT,
    "tipo" "TipoDeEventoDaJornada" NOT NULL,
    "deEstagio" TEXT,
    "paraEstagio" TEXT,
    "autor" "AutorDaMensagem" NOT NULL,
    "autorUserId" TEXT,
    "autorLabel" TEXT,
    "motivo" TEXT,
    "nota" TEXT,
    "fonte" TEXT,
    "interna" BOOLEAN NOT NULL DEFAULT true,
    "chaveDeIdempotencia" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jornada_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "empresas_chaveDeDedupe_key" ON "empresas"("chaveDeDedupe");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresas_estagio_estagioMudouEm_idx" ON "empresas"("estagio", "estagioMudouEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresas_prioridade_scoreIcp_idx" ON "empresas"("prioridade", "scoreIcp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresas_cidade_estado_idx" ON "empresas"("cidade", "estado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresas_categoria_idx" ON "empresas"("categoria");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresas_cnpj_idx" ON "empresas"("cnpj");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresas_loteDeProspeccaoId_idx" ON "empresas"("loteDeProspeccaoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresa_fatores_icp_empresaId_criadoEm_idx" ON "empresa_fatores_icp"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresa_fatores_icp_fator_idx" ON "empresa_fatores_icp"("fator");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresa_proveniencias_empresaId_campo_coletadoEm_idx" ON "empresa_proveniencias"("empresaId", "campo", "coletadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "empresa_proveniencias_fonte_idx" ON "empresa_proveniencias"("fonte");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contatos_de_empresa_empresaId_ehDecisor_idx" ON "contatos_de_empresa"("empresaId", "ehDecisor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contatos_de_empresa_telefoneDigits_idx" ON "contatos_de_empresa"("telefoneDigits");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contatos_de_empresa_ehGatekeeper_tipoDeGatekeeper_idx" ON "contatos_de_empresa"("ehGatekeeper", "tipoDeGatekeeper");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contatos_de_empresa_empresaId_telefoneDigits_key" ON "contatos_de_empresa"("empresaId", "telefoneDigits");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "oportunidades_chaveDeOrigem_key" ON "oportunidades"("chaveDeOrigem");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_estagio_estagioMudouEm_idx" ON "oportunidades"("estagio", "estagioMudouEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_empresaId_estagio_idx" ON "oportunidades"("empresaId", "estagio");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_leadId_idx" ON "oportunidades"("leadId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_previsaoDeFechamento_idx" ON "oportunidades"("previsaoDeFechamento");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_motivoPerdaId_idx" ON "oportunidades"("motivoPerdaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "clientes_comerciais_oportunidadeId_key" ON "clientes_comerciais"("oportunidadeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "clientes_comerciais_situacao_situacaoMudouEm_idx" ON "clientes_comerciais"("situacao", "situacaoMudouEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "clientes_comerciais_empresaId_idx" ON "clientes_comerciais"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "clientes_comerciais_riscoDeChurn_idx" ON "clientes_comerciais"("riscoDeChurn");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "clientes_comerciais_restaurantId_idx" ON "clientes_comerciais"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "jornada_eventos_chaveDeIdempotencia_key" ON "jornada_eventos"("chaveDeIdempotencia");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jornada_eventos_entidade_entidadeId_criadoEm_idx" ON "jornada_eventos"("entidade", "entidadeId", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jornada_eventos_empresaId_criadoEm_idx" ON "jornada_eventos"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jornada_eventos_oportunidadeId_criadoEm_idx" ON "jornada_eventos"("oportunidadeId", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jornada_eventos_clienteId_criadoEm_idx" ON "jornada_eventos"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jornada_eventos_leadId_criadoEm_idx" ON "jornada_eventos"("leadId", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jornada_eventos_tipo_criadoEm_idx" ON "jornada_eventos"("tipo", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jornada_eventos_autor_criadoEm_idx" ON "jornada_eventos"("autor", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SiteLead_empresaId_idx" ON "SiteLead"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SiteLead_contatoId_idx" ON "SiteLead"("contatoId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiteLead_empresaId_fkey') THEN
    ALTER TABLE "SiteLead" ADD CONSTRAINT "SiteLead_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiteLead_contatoId_fkey') THEN
    ALTER TABLE "SiteLead" ADD CONSTRAINT "SiteLead_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contatos_de_empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_fatores_icp_empresaId_fkey') THEN
    ALTER TABLE "empresa_fatores_icp" ADD CONSTRAINT "empresa_fatores_icp_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_proveniencias_empresaId_fkey') THEN
    ALTER TABLE "empresa_proveniencias" ADD CONSTRAINT "empresa_proveniencias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contatos_de_empresa_empresaId_fkey') THEN
    ALTER TABLE "contatos_de_empresa" ADD CONSTRAINT "contatos_de_empresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_empresaId_fkey') THEN
    ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_contatoDecisorId_fkey') THEN
    ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_contatoDecisorId_fkey" FOREIGN KEY ("contatoDecisorId") REFERENCES "contatos_de_empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_leadId_fkey') THEN
    ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_motivoPerdaId_fkey') THEN
    ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_motivoPerdaId_fkey" FOREIGN KEY ("motivoPerdaId") REFERENCES "motivos_de_perda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_comerciais_oportunidadeId_fkey') THEN
    ALTER TABLE "clientes_comerciais" ADD CONSTRAINT "clientes_comerciais_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_comerciais_empresaId_fkey') THEN
    ALTER TABLE "clientes_comerciais" ADD CONSTRAINT "clientes_comerciais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jornada_eventos_empresaId_fkey') THEN
    ALTER TABLE "jornada_eventos" ADD CONSTRAINT "jornada_eventos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jornada_eventos_contatoId_fkey') THEN
    ALTER TABLE "jornada_eventos" ADD CONSTRAINT "jornada_eventos_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contatos_de_empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jornada_eventos_oportunidadeId_fkey') THEN
    ALTER TABLE "jornada_eventos" ADD CONSTRAINT "jornada_eventos_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jornada_eventos_clienteId_fkey') THEN
    ALTER TABLE "jornada_eventos" ADD CONSTRAINT "jornada_eventos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes_comerciais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

