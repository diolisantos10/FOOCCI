-- Controle operacional dos templates da Sala Comercial.
--
-- A aprovação da Meta responde "a Meta permite enviar". Este controle responde
-- uma pergunta diferente: "a Foocci quer usar este modelo nas abordagens?".
-- Tudo nasce desligado de propósito: depois do deploy, template antigo nunca
-- volta a ser usado só porque continua APPROVED na Meta.
CREATE TABLE IF NOT EXISTS "modelos_de_vendas_envio" (
  "phoneNumberId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "idioma" TEXT NOT NULL,
  "podeEnviar" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "modelos_de_vendas_envio_pkey"
    PRIMARY KEY ("phoneNumberId", "nome", "idioma")
);

CREATE INDEX IF NOT EXISTS "modelos_de_vendas_envio_pode_enviar_idx"
  ON "modelos_de_vendas_envio" ("phoneNumberId", "podeEnviar");
