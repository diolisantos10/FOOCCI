-- ═══════════════════════════════════════════════════════════════════════════
-- SALA DE VENDAS E SDRs — comando do CEO de 25/08/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Constrói a base da plataforma onde os SDRs (humanos e o Agente IA "TA")
-- atendem quem quer CONTRATAR a Foocci.
--
-- ── O QUE ESTA MIGRAÇÃO NÃO FAZ ──
--
-- Nenhum `DROP TABLE`, nenhum `DROP COLUMN`. Toda coluna nova é opcional ou tem
-- padrão, e por isso a aplicação atual continua subindo sem enxergar nada disto.
-- A única mudança destrutiva possível seria o enum do funil — e é justamente
-- por isso que ele é convertido com CASE explícito, abaixo.
--
-- ── E O QUE ELA NÃO LIGA ──
--
-- `sdr_ia_config.ligado` nasce `false`. A migração NÃO cria configuração, NÃO
-- publica versão de prompt e NÃO liga agente nenhum. A Sala nasce operada por
-- gente; ligar o TA é ato humano, uma vez, com evidência.

-- CreateEnum
CREATE TYPE "LeadTemperatura" AS ENUM ('PRIORIDADE_MAXIMA', 'QUENTE', 'MORNO', 'FRIO', 'DESQUALIFICADO', 'NUTRICAO');

-- CreateEnum
CREATE TYPE "DirecaoDaMensagem" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "TipoDaMensagem" AS ENUM ('TEXTO', 'AUDIO', 'IMAGEM', 'DOCUMENTO', 'VIDEO', 'TEMPLATE', 'NAO_SUPORTADO');

-- CreateEnum
CREATE TYPE "StatusDaMensagem" AS ENUM ('PENDENTE', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "AutorDaMensagem" AS ENUM ('IA', 'HUMANO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "TipoDeTarefa" AS ENUM ('FOLLOW_UP', 'LIGACAO', 'MENSAGEM', 'PROPOSTA', 'CONFIRMACAO_DE_REUNIAO', 'REENGAJAMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "SituacaoDaTarefa" AS ENUM ('ABERTA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SituacaoDoCompromisso" AS ENUM ('AGENDADO', 'CONFIRMADO', 'REALIZADO', 'NAO_COMPARECEU', 'REAGENDADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SituacaoDaProposta" AS ENUM ('RASCUNHO', 'ENVIADA', 'EM_NEGOCIACAO', 'ACEITA', 'RECUSADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "MotivoDoHandoff" AS ENUM ('PEDIU_HUMANO', 'INTENCAO_DE_COMPRA', 'PEDIU_PROPOSTA', 'PEDIU_DESCONTO', 'OBJECAO_NAO_RESOLVIDA', 'IA_INSEGURA', 'SENTIMENTO_NEGATIVO', 'RISCO', 'INFORMACAO_NAO_CONFIRMADA', 'SCORE_ATINGIU_LIMITE', 'IA_FALHOU', 'DEVOLUCAO_PARA_IA', 'DISTRIBUICAO');

-- CreateEnum
CREATE TYPE "EstadoDoSdr" AS ENUM ('DISPONIVEL', 'OCUPADO', 'PAUSADO', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ModoDeDistribuicao" AS ENUM ('MANUAL', 'RODIZIO', 'DISPONIBILIDADE', 'ESPECIALIDADE');

-- CreateEnum
CREATE TYPE "SituacaoDaVersao" AS ENUM ('RASCUNHO', 'EM_TESTE', 'PUBLICADA', 'APOSENTADA');

-- CreateEnum
CREATE TYPE "SituacaoDaCadencia" AS ENUM ('ATIVA', 'PAUSADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "CriterioDeQA" AS ENUM ('VELOCIDADE', 'ABERTURA', 'CLAREZA', 'ESCUTA', 'QUALIFICACAO', 'DOR', 'VALOR', 'PERSONALIZACAO', 'OBJECOES', 'SEGURANCA_DA_INFORMACAO', 'EMPATIA', 'PROXIMO_PASSO', 'FECHAMENTO', 'CONFORMIDADE', 'REGISTRO_NO_CRM');

-- CreateEnum
CREATE TYPE "OrigemDaAvaliacao" AS ENUM ('AUTOMATICA', 'HUMANA');

-- CreateEnum
CREATE TYPE "SituacaoDaAvaliacao" AS ENUM ('RASCUNHO', 'PUBLICADA', 'CONTESTADA', 'REVISADA');

-- ═══════════════════════════════════════════════════════════════════════════
-- O FUNIL: DE 6 PARA 11 ETAPAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── POR QUE ESTE BLOCO É ESCRITO À MÃO ──
--
-- O `prisma migrate diff` gerou este trecho sozinho, e ele tinha DOIS defeitos
-- que só apareceriam com dado real dentro do banco:
--
--   1. **Cast direto.** Ele escreveu `"stage"::text::"SiteLeadStage_new"`. Isso
--      funciona num banco vazio e ESTOURA em qualquer linha gravada como
--      'CONTATADO', 'PROPOSTA' ou 'FECHADO' — que são exatamente os valores que
--      a base de produção tem. O erro seria em tempo de migração, com o deploy
--      no meio do caminho.
--
--   2. **Ordem errada.** Ele alterava "lead_handoffs" e "lead_avaliacoes_qa"
--      ANTES de criar essas tabelas, mais abaixo no mesmo arquivo. Falharia
--      mesmo com o banco vazio.
--
-- Por isso o `CASE` explícito, e por isso a conversão toca apenas as duas
-- tabelas que JÁ EXISTEM. As novas nascem com o tipo já convertido.
--
-- Como no v3: recriar o tipo em vez de renomear valor, porque o Postgres não
-- remove valor de enum — 'CONTATADO' e 'FECHADO' ficariam para sempre, e um
-- enum com valores que a arquitetura aposentou é um convite a usá-los.

BEGIN;

CREATE TYPE "SiteLeadStage_new" AS ENUM (
  'NOVO',
  'PRIMEIRO_CONTATO',
  'EM_QUALIFICACAO',
  'QUALIFICADO',
  'DEMO_AGENDADA',
  'DEMO_REALIZADA',
  'PROPOSTA_ENVIADA',
  'EM_NEGOCIACAO',
  'GANHO',
  'PERDIDO',
  'NUTRICAO'
);

ALTER TABLE "SiteLead" ALTER COLUMN "stage" DROP DEFAULT;

-- O mapa do que existia para o que passa a existir. Cada valor antigo aparece
-- escrito, com o novo ao lado — quem ler daqui a um ano vê o mapa inteiro sem
-- procurar noutro lugar.
--
-- CONTATADO → PRIMEIRO_CONTATO, e não EM_QUALIFICACAO: "recebeu a primeira
--   mensagem" não prova que a descoberta começou. Promover na migração
--   inventaria progresso que ninguém observou.
-- PROPOSTA  → PROPOSTA_ENVIADA (mesmo significado, nome mais preciso).
-- FECHADO   → GANHO. O nome antigo era ambíguo: "fechado" também descreve o
--   perdido, e mais de um relatório já somou os dois.
ALTER TABLE "SiteLead"
  ALTER COLUMN "stage" TYPE "SiteLeadStage_new"
  USING (
    CASE "stage"::text
      WHEN 'NOVO'        THEN 'NOVO'
      WHEN 'CONTATADO'   THEN 'PRIMEIRO_CONTATO'
      WHEN 'QUALIFICADO' THEN 'QUALIFICADO'
      WHEN 'PROPOSTA'    THEN 'PROPOSTA_ENVIADA'
      WHEN 'FECHADO'     THEN 'GANHO'
      WHEN 'PERDIDO'     THEN 'PERDIDO'
    END
  )::"SiteLeadStage_new";

-- O histórico recebe o MESMO mapa. Converter a etapa atual e deixar a linha do
-- tempo para trás produziria um lead em 'GANHO' cuja história diz que ele nunca
-- passou por lá.
ALTER TABLE "SiteLeadInteraction"
  ALTER COLUMN "fromStage" TYPE "SiteLeadStage_new"
  USING (
    CASE "fromStage"::text
      WHEN 'NOVO'        THEN 'NOVO'
      WHEN 'CONTATADO'   THEN 'PRIMEIRO_CONTATO'
      WHEN 'QUALIFICADO' THEN 'QUALIFICADO'
      WHEN 'PROPOSTA'    THEN 'PROPOSTA_ENVIADA'
      WHEN 'FECHADO'     THEN 'GANHO'
      WHEN 'PERDIDO'     THEN 'PERDIDO'
    END
  )::"SiteLeadStage_new";

ALTER TABLE "SiteLeadInteraction"
  ALTER COLUMN "toStage" TYPE "SiteLeadStage_new"
  USING (
    CASE "toStage"::text
      WHEN 'NOVO'        THEN 'NOVO'
      WHEN 'CONTATADO'   THEN 'PRIMEIRO_CONTATO'
      WHEN 'QUALIFICADO' THEN 'QUALIFICADO'
      WHEN 'PROPOSTA'    THEN 'PROPOSTA_ENVIADA'
      WHEN 'FECHADO'     THEN 'GANHO'
      WHEN 'PERDIDO'     THEN 'PERDIDO'
    END
  )::"SiteLeadStage_new";

ALTER TYPE "SiteLeadStage" RENAME TO "SiteLeadStage_old";
ALTER TYPE "SiteLeadStage_new" RENAME TO "SiteLeadStage";
DROP TYPE "SiteLeadStage_old";

ALTER TABLE "SiteLead" ALTER COLUMN "stage" SET DEFAULT 'NOVO';

COMMIT;


-- AlterTable
ALTER TABLE "SiteLead" ADD COLUMN     "email" TEXT,
ADD COLUMN     "motivoPerdaId" TEXT,
ADD COLUMN     "naoLidas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "primeiraRespostaEm" TIMESTAMP(3),
ADD COLUMN     "prioritario" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proximaAcaoEm" TIMESTAMP(3),
ADD COLUMN     "proximaAcaoNota" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "scoreAt" TIMESTAMP(3),
ADD COLUMN     "slaVenceEm" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "temperatura" "LeadTemperatura",
ADD COLUMN     "ultimaMensagemDeQuem" "DirecaoDaMensagem",
ADD COLUMN     "ultimaMensagemEm" TIMESTAMP(3),
ADD COLUMN     "ultimaMensagemTexto" TEXT;

-- CreateTable
CREATE TABLE "lead_mensagens" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "direcao" "DirecaoDaMensagem" NOT NULL,
    "tipo" "TipoDaMensagem" NOT NULL DEFAULT 'TEXTO',
    "status" "StatusDaMensagem" NOT NULL DEFAULT 'PENDENTE',
    "waMessageId" TEXT,
    "tipoCru" TEXT,
    "texto" TEXT,
    "midiaId" TEXT,
    "midiaMimeType" TEXT,
    "midiaNome" TEXT,
    "legenda" TEXT,
    "duracaoSeg" INTEGER,
    "templateNome" TEXT,
    "autor" "AutorDaMensagem",
    "autorUserId" TEXT,
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ocorreuEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lidaEm" TIMESTAMP(3),

    CONSTRAINT "lead_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_qualificacoes" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "segmento" TEXT,
    "unidades" INTEGER,
    "volumeMensal" INTEGER,
    "canaisAtuais" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sistemaAtual" TEXT,
    "dorPrincipal" TEXT,
    "objetivo" TEXT,
    "planoDeInteresse" TEXT,
    "urgencia" TEXT,
    "poderDeDecisao" TEXT,
    "faixaDeOrcamento" TEXT,
    "observacoes" TEXT,
    "atualizadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_qualificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_score_fatores" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fator" TEXT NOT NULL,
    "observado" TEXT NOT NULL,
    "pontos" INTEGER NOT NULL,
    "reguaVersao" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_score_fatores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivos_de_perda" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "grupo" TEXT,
    "exigeDetalhe" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motivos_de_perda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_tarefas" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tipo" "TipoDeTarefa" NOT NULL DEFAULT 'FOLLOW_UP',
    "situacao" "SituacaoDaTarefa" NOT NULL DEFAULT 'ABERTA',
    "titulo" TEXT NOT NULL,
    "nota" TEXT,
    "venceEm" TIMESTAMP(3) NOT NULL,
    "concluidaEm" TIMESTAMP(3),
    "responsavelId" TEXT,
    "criadaPor" "AutorDaMensagem" NOT NULL DEFAULT 'HUMANO',
    "cadenciaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_compromissos" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "situacao" "SituacaoDoCompromisso" NOT NULL DEFAULT 'AGENDADO',
    "comecaEm" TIMESTAMP(3) NOT NULL,
    "duracaoMin" INTEGER NOT NULL DEFAULT 30,
    "local" TEXT,
    "nota" TEXT,
    "responsavelId" TEXT,
    "confirmadoEm" TIMESTAMP(3),
    "remarcadoParaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_compromissos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_propostas" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "situacao" "SituacaoDaProposta" NOT NULL DEFAULT 'RASCUNHO',
    "plano" TEXT,
    "valorMensalCent" INTEGER,
    "descontoPct" INTEGER,
    "condicoes" TEXT,
    "enviadaEm" TIMESTAMP(3),
    "respondidaEm" TIMESTAMP(3),
    "validaAte" TIMESTAMP(3),
    "criadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_handoffs" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "de" "LeadAtendidoPor" NOT NULL,
    "para" "LeadAtendidoPor" NOT NULL,
    "motivo" "MotivoDoHandoff" NOT NULL,
    "deUserId" TEXT,
    "paraUserId" TEXT,
    "resumo" TEXT,
    "dorIdentificada" TEXT,
    "objecoes" TEXT,
    "proximaAcao" TEXT,
    "scoreNoMomento" INTEGER,
    "etapaNoMomento" "SiteLeadStage",
    "objetivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aceitoEm" TIMESTAMP(3),

    CONSTRAINT "lead_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sdr_disponibilidade" (
    "id" TEXT NOT NULL,
    "internalUserId" TEXT NOT NULL,
    "estado" "EstadoDoSdr" NOT NULL DEFAULT 'OFFLINE',
    "capacidade" INTEGER NOT NULL DEFAULT 15,
    "especialidades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regioes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "motivoDaPausa" TEXT,
    "pausadoAte" TIMESTAMP(3),
    "vistoEm" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sdr_disponibilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sdr_ia_config" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT 'ta',
    "nome" TEXT NOT NULL DEFAULT 'TA',
    "ligado" BOOLEAN NOT NULL DEFAULT false,
    "versaoAtivaId" TEXT,
    "horaInicio" INTEGER NOT NULL DEFAULT 9,
    "horaFim" INTEGER NOT NULL DEFAULT 20,
    "maxSemResposta" INTEGER NOT NULL DEFAULT 3,
    "scoreParaHumano" INTEGER NOT NULL DEFAULT 70,
    "distribuicao" "ModoDeDistribuicao" NOT NULL DEFAULT 'MANUAL',
    "slaPrimeiraRespostaMin" INTEGER NOT NULL DEFAULT 15,
    "slaEsperaPorGenteMin" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sdr_ia_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sdr_ia_config_versoes" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "situacao" "SituacaoDaVersao" NOT NULL DEFAULT 'RASCUNHO',
    "identidade" TEXT NOT NULL,
    "tomDeVoz" TEXT,
    "objetivos" TEXT,
    "perguntas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "proibidos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gatilhos" "MotivoDoHandoff"[] DEFAULT ARRAY[]::"MotivoDoHandoff"[],
    "reguaDeScore" JSONB,
    "notaDaVersao" TEXT,
    "publicadaEm" TIMESTAMP(3),
    "publicadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sdr_ia_config_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cadencias" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "quando" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cadencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cadencia_passos" (
    "id" TEXT NOT NULL,
    "cadenciaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "esperaHoras" INTEGER NOT NULL,
    "tipo" "TipoDeTarefa" NOT NULL DEFAULT 'FOLLOW_UP',
    "executor" "AutorDaMensagem" NOT NULL DEFAULT 'HUMANO',
    "titulo" TEXT NOT NULL,
    "templateNome" TEXT,
    "roteiro" TEXT,

    CONSTRAINT "cadencia_passos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_cadencias" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "cadenciaId" TEXT NOT NULL,
    "situacao" "SituacaoDaCadencia" NOT NULL DEFAULT 'ATIVA',
    "passoAtual" INTEGER NOT NULL DEFAULT 0,
    "proximoEm" TIMESTAMP(3),
    "motivoDaSaida" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_cadencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_avaliacoes_qa" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "origem" "OrigemDaAvaliacao" NOT NULL DEFAULT 'HUMANA',
    "situacao" "SituacaoDaAvaliacao" NOT NULL DEFAULT 'RASCUNHO',
    "avaliado" "AutorDaMensagem" NOT NULL,
    "avaliadoUserId" TEXT,
    "avaliadorId" TEXT,
    "nota" INTEGER,
    "etapa" "SiteLeadStage",
    "pontosFortes" TEXT,
    "falhas" TEXT,
    "oportunidades" TEXT,
    "coaching" TEXT,
    "riscoDePerda" BOOLEAN NOT NULL DEFAULT false,
    "alertaCritico" BOOLEAN NOT NULL DEFAULT false,
    "contestacao" TEXT,
    "contestadaEm" TIMESTAMP(3),
    "respostaDaRevisao" TEXT,
    "revisadaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_avaliacoes_qa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_avaliacao_criterios" (
    "id" TEXT NOT NULL,
    "avaliacaoId" TEXT NOT NULL,
    "criterio" "CriterioDeQA" NOT NULL,
    "nota" INTEGER,
    "comentario" TEXT,
    "mensagemId" TEXT,

    CONSTRAINT "lead_avaliacao_criterios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_mensagens_waMessageId_key" ON "lead_mensagens"("waMessageId");

-- CreateIndex
CREATE INDEX "lead_mensagens_leadId_ocorreuEm_idx" ON "lead_mensagens"("leadId", "ocorreuEm");

-- CreateIndex
CREATE INDEX "lead_mensagens_leadId_direcao_ocorreuEm_idx" ON "lead_mensagens"("leadId", "direcao", "ocorreuEm");

-- CreateIndex
CREATE INDEX "lead_mensagens_status_idx" ON "lead_mensagens"("status");

-- CreateIndex
CREATE INDEX "lead_mensagens_ocorreuEm_idx" ON "lead_mensagens"("ocorreuEm");

-- CreateIndex
CREATE UNIQUE INDEX "lead_qualificacoes_leadId_key" ON "lead_qualificacoes"("leadId");

-- CreateIndex
CREATE INDEX "lead_score_fatores_leadId_createdAt_idx" ON "lead_score_fatores"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_score_fatores_fator_idx" ON "lead_score_fatores"("fator");

-- CreateIndex
CREATE UNIQUE INDEX "motivos_de_perda_slug_key" ON "motivos_de_perda"("slug");

-- CreateIndex
CREATE INDEX "motivos_de_perda_ativo_ordem_idx" ON "motivos_de_perda"("ativo", "ordem");

-- CreateIndex
CREATE INDEX "lead_tarefas_leadId_situacao_idx" ON "lead_tarefas"("leadId", "situacao");

-- CreateIndex
CREATE INDEX "lead_tarefas_responsavelId_situacao_venceEm_idx" ON "lead_tarefas"("responsavelId", "situacao", "venceEm");

-- CreateIndex
CREATE INDEX "lead_tarefas_situacao_venceEm_idx" ON "lead_tarefas"("situacao", "venceEm");

-- CreateIndex
CREATE UNIQUE INDEX "lead_compromissos_remarcadoParaId_key" ON "lead_compromissos"("remarcadoParaId");

-- CreateIndex
CREATE INDEX "lead_compromissos_leadId_comecaEm_idx" ON "lead_compromissos"("leadId", "comecaEm");

-- CreateIndex
CREATE INDEX "lead_compromissos_responsavelId_comecaEm_idx" ON "lead_compromissos"("responsavelId", "comecaEm");

-- CreateIndex
CREATE INDEX "lead_compromissos_situacao_comecaEm_idx" ON "lead_compromissos"("situacao", "comecaEm");

-- CreateIndex
CREATE INDEX "lead_propostas_leadId_createdAt_idx" ON "lead_propostas"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_propostas_situacao_idx" ON "lead_propostas"("situacao");

-- CreateIndex
CREATE INDEX "lead_handoffs_leadId_createdAt_idx" ON "lead_handoffs"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_handoffs_motivo_createdAt_idx" ON "lead_handoffs"("motivo", "createdAt");

-- CreateIndex
CREATE INDEX "lead_handoffs_aceitoEm_idx" ON "lead_handoffs"("aceitoEm");

-- CreateIndex
CREATE UNIQUE INDEX "sdr_disponibilidade_internalUserId_key" ON "sdr_disponibilidade"("internalUserId");

-- CreateIndex
CREATE INDEX "sdr_disponibilidade_estado_idx" ON "sdr_disponibilidade"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "sdr_ia_config_slug_key" ON "sdr_ia_config"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "sdr_ia_config_versaoAtivaId_key" ON "sdr_ia_config"("versaoAtivaId");

-- CreateIndex
CREATE INDEX "sdr_ia_config_versoes_situacao_idx" ON "sdr_ia_config_versoes"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "sdr_ia_config_versoes_configId_numero_key" ON "sdr_ia_config_versoes"("configId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "cadencias_slug_key" ON "cadencias"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "cadencia_passos_cadenciaId_ordem_key" ON "cadencia_passos"("cadenciaId", "ordem");

-- CreateIndex
CREATE INDEX "lead_cadencias_situacao_proximoEm_idx" ON "lead_cadencias"("situacao", "proximoEm");

-- CreateIndex
CREATE UNIQUE INDEX "lead_cadencias_leadId_cadenciaId_key" ON "lead_cadencias"("leadId", "cadenciaId");

-- CreateIndex
CREATE INDEX "lead_avaliacoes_qa_leadId_createdAt_idx" ON "lead_avaliacoes_qa"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_avaliacoes_qa_avaliadoUserId_createdAt_idx" ON "lead_avaliacoes_qa"("avaliadoUserId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_avaliacoes_qa_situacao_alertaCritico_idx" ON "lead_avaliacoes_qa"("situacao", "alertaCritico");

-- CreateIndex
CREATE INDEX "lead_avaliacoes_qa_avaliado_etapa_idx" ON "lead_avaliacoes_qa"("avaliado", "etapa");

-- CreateIndex
CREATE INDEX "lead_avaliacao_criterios_criterio_nota_idx" ON "lead_avaliacao_criterios"("criterio", "nota");

-- CreateIndex
CREATE UNIQUE INDEX "lead_avaliacao_criterios_avaliacaoId_criterio_key" ON "lead_avaliacao_criterios"("avaliacaoId", "criterio");

-- CreateIndex
CREATE INDEX "SiteLead_ultimaMensagemEm_idx" ON "SiteLead"("ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "SiteLead_proximaAcaoEm_idx" ON "SiteLead"("proximaAcaoEm");

-- CreateIndex
CREATE INDEX "SiteLead_slaVenceEm_idx" ON "SiteLead"("slaVenceEm");

-- CreateIndex
CREATE INDEX "SiteLead_stage_ultimaMensagemEm_idx" ON "SiteLead"("stage", "ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "SiteLead_atendenteUserId_ultimaMensagemEm_idx" ON "SiteLead"("atendenteUserId", "ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "SiteLead_temperatura_idx" ON "SiteLead"("temperatura");

-- CreateIndex
CREATE INDEX "SiteLead_prioritario_idx" ON "SiteLead"("prioritario");

-- CreateIndex
CREATE INDEX "SiteLead_motivoPerdaId_idx" ON "SiteLead"("motivoPerdaId");

-- AddForeignKey
ALTER TABLE "SiteLead" ADD CONSTRAINT "SiteLead_motivoPerdaId_fkey" FOREIGN KEY ("motivoPerdaId") REFERENCES "motivos_de_perda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_mensagens" ADD CONSTRAINT "lead_mensagens_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_mensagens" ADD CONSTRAINT "lead_mensagens_autorUserId_fkey" FOREIGN KEY ("autorUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_qualificacoes" ADD CONSTRAINT "lead_qualificacoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_qualificacoes" ADD CONSTRAINT "lead_qualificacoes_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_score_fatores" ADD CONSTRAINT "lead_score_fatores_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tarefas" ADD CONSTRAINT "lead_tarefas_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tarefas" ADD CONSTRAINT "lead_tarefas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tarefas" ADD CONSTRAINT "lead_tarefas_cadenciaId_fkey" FOREIGN KEY ("cadenciaId") REFERENCES "lead_cadencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_compromissos" ADD CONSTRAINT "lead_compromissos_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_compromissos" ADD CONSTRAINT "lead_compromissos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_compromissos" ADD CONSTRAINT "lead_compromissos_remarcadoParaId_fkey" FOREIGN KEY ("remarcadoParaId") REFERENCES "lead_compromissos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_propostas" ADD CONSTRAINT "lead_propostas_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_propostas" ADD CONSTRAINT "lead_propostas_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_handoffs" ADD CONSTRAINT "lead_handoffs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_handoffs" ADD CONSTRAINT "lead_handoffs_deUserId_fkey" FOREIGN KEY ("deUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_handoffs" ADD CONSTRAINT "lead_handoffs_paraUserId_fkey" FOREIGN KEY ("paraUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sdr_disponibilidade" ADD CONSTRAINT "sdr_disponibilidade_internalUserId_fkey" FOREIGN KEY ("internalUserId") REFERENCES "internal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sdr_ia_config" ADD CONSTRAINT "sdr_ia_config_versaoAtivaId_fkey" FOREIGN KEY ("versaoAtivaId") REFERENCES "sdr_ia_config_versoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sdr_ia_config_versoes" ADD CONSTRAINT "sdr_ia_config_versoes_configId_fkey" FOREIGN KEY ("configId") REFERENCES "sdr_ia_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sdr_ia_config_versoes" ADD CONSTRAINT "sdr_ia_config_versoes_publicadaPorId_fkey" FOREIGN KEY ("publicadaPorId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cadencia_passos" ADD CONSTRAINT "cadencia_passos_cadenciaId_fkey" FOREIGN KEY ("cadenciaId") REFERENCES "cadencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_cadencias" ADD CONSTRAINT "lead_cadencias_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_cadencias" ADD CONSTRAINT "lead_cadencias_cadenciaId_fkey" FOREIGN KEY ("cadenciaId") REFERENCES "cadencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_avaliacoes_qa" ADD CONSTRAINT "lead_avaliacoes_qa_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_avaliacoes_qa" ADD CONSTRAINT "lead_avaliacoes_qa_avaliadoUserId_fkey" FOREIGN KEY ("avaliadoUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_avaliacoes_qa" ADD CONSTRAINT "lead_avaliacoes_qa_avaliadorId_fkey" FOREIGN KEY ("avaliadorId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_avaliacao_criterios" ADD CONSTRAINT "lead_avaliacao_criterios_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "lead_avaliacoes_qa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_avaliacao_criterios" ADD CONSTRAINT "lead_avaliacao_criterios_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "lead_mensagens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
