-- Cofre de credenciais de infraestrutura — o token do Railway para de ser regerado.
--
-- Por que existe: o token do Railway é chave-mestra (quem o tem lê e altera TODOS os
-- segredos do projeto). Até agora ele não morava em lugar nenhum: era gerado, usado e
-- perdido. Agora mora aqui, criptografado, com prova de quem o leu.
--
-- Três decisões que a tabela sustenta por construção, não por convenção:
--   1. Não existe coluna com o token em texto puro. Só `tokenEncrypted` (AES-256-GCM,
--      mesma ENCRYPTION_KEY já usada pelo Meta e pela Evolution).
--   2. `last4` é gravado no save, para que LISTAR nunca precise descriptografar —
--      abrir a tela não toca no segredo.
--   3. Toda leitura para uso grava linha em `infra_credential_accesses`. A trilha
--      sobrevive ao delete da credencial (`ON DELETE SET NULL`): apagar o token não
--      pode apagar o registro de quem já o usou.
--
-- Aditiva: tabelas novas, nada existente muda.

CREATE TABLE IF NOT EXISTS "infra_credentials" (
    "id"               TEXT         NOT NULL,
    "service"          TEXT         NOT NULL,        -- "railway", …
    "label"            TEXT         NOT NULL,        -- o que o CEO lê na tela
    "tokenEncrypted"   TEXT         NOT NULL,        -- AES-256-GCM. Nunca em texto puro.
    "last4"            TEXT         NOT NULL,        -- único pedaço que a tela mostra
    "tokenLength"      INTEGER      NOT NULL,        -- "colei inteiro?" sem revelar nada
    "savedBy"          TEXT,
    "validationStatus" TEXT         NOT NULL DEFAULT 'unknown', -- 'valid' | 'unknown'
    "validationDetail" TEXT,
    "validatedAt"      TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "infra_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "infra_credentials_service_key"
    ON "infra_credentials" ("service");

CREATE TABLE IF NOT EXISTS "infra_credential_accesses" (
    "id"           TEXT         NOT NULL,
    "credentialId" TEXT,
    "service"      TEXT         NOT NULL,
    "actor"        TEXT         NOT NULL,
    "purpose"      TEXT         NOT NULL,
    "outcome"      TEXT         NOT NULL,            -- 'ok' | 'missing' | 'decrypt_failed'
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "infra_credential_accesses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "infra_credential_accesses_service_createdAt_idx"
    ON "infra_credential_accesses" ("service", "createdAt");

DO $$
BEGIN
    ALTER TABLE "infra_credential_accesses"
        ADD CONSTRAINT "infra_credential_accesses_credentialId_fkey"
        FOREIGN KEY ("credentialId") REFERENCES "infra_credentials"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
