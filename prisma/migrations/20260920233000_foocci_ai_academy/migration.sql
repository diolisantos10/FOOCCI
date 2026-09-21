CREATE TYPE "FuncaoDaAcademiaIa" AS ENUM (
  'SUPERVISORA', 'SDR', 'CLOSER'
);

CREATE TYPE "EstadoDaCertificacaoIa" AS ENUM (
  'SEM_EXECUTOR', 'EM_PREPARACAO', 'EM_AVALIACAO', 'APROVADO',
  'REPROVADO', 'BLOQUEADO', 'EXPIRADO'
);

CREATE TABLE "academia_ia_config" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "exigirCertificacao" BOOLEAN NOT NULL DEFAULT false,
  "conteudoVersao" TEXT NOT NULL DEFAULT 'foocci-ai-academy-v1',
  "atualizadoPor" TEXT,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academia_ia_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academia_ia_certificacoes" (
  "id" TEXT NOT NULL,
  "funcao" "FuncaoDaAcademiaIa" NOT NULL,
  "executorId" TEXT NOT NULL,
  "executorVersao" TEXT NOT NULL,
  "conteudoVersao" TEXT NOT NULL,
  "estado" "EstadoDaCertificacaoIa" NOT NULL DEFAULT 'EM_PREPARACAO',
  "nota" INTEGER,
  "falhasCriticas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidencias" JSONB,
  "provider" TEXT,
  "modelo" TEXT,
  "certificadaEm" TIMESTAMP(3),
  "validaAte" TIMESTAMP(3),
  "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadaEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academia_ia_certificacoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academia_ia_certificacoes_nota_check" CHECK ("nota" IS NULL OR "nota" BETWEEN 0 AND 100)
);

CREATE TABLE "academia_ia_tentativas" (
  "id" TEXT NOT NULL,
  "certificacaoId" TEXT,
  "funcao" "FuncaoDaAcademiaIa" NOT NULL,
  "casoId" TEXT NOT NULL,
  "casoVersao" TEXT NOT NULL,
  "passou" BOOLEAN NOT NULL,
  "nota" INTEGER NOT NULL,
  "falhasCriticas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidencia" JSONB NOT NULL,
  "provider" TEXT,
  "modelo" TEXT,
  "latenciaMs" INTEGER,
  "executadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academia_ia_tentativas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academia_ia_tentativas_nota_check" CHECK ("nota" BETWEEN 0 AND 100),
  CONSTRAINT "academia_ia_tentativas_latencia_check" CHECK ("latenciaMs" IS NULL OR "latenciaMs" >= 0)
);

CREATE UNIQUE INDEX "academia_ia_certificacoes_funcao_executorId_executorVersao_conteudoVersao_key"
  ON "academia_ia_certificacoes"("funcao", "executorId", "executorVersao", "conteudoVersao");
CREATE INDEX "academia_ia_certificacoes_funcao_estado_atualizadaEm_idx"
  ON "academia_ia_certificacoes"("funcao", "estado", "atualizadaEm");
CREATE INDEX "academia_ia_tentativas_funcao_executadaEm_idx"
  ON "academia_ia_tentativas"("funcao", "executadaEm");
CREATE INDEX "academia_ia_tentativas_certificacaoId_idx"
  ON "academia_ia_tentativas"("certificacaoId");

ALTER TABLE "academia_ia_tentativas"
  ADD CONSTRAINT "academia_ia_tentativas_certificacaoId_fkey"
  FOREIGN KEY ("certificacaoId") REFERENCES "academia_ia_certificacoes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
