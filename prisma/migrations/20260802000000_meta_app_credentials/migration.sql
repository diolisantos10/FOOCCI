-- Credenciais do aplicativo Meta — a chave mestra sai do Railway e ganha tela.
--
-- Existe UM aplicativo da Foocci dentro da Meta (`Foocci Whats`) e ele serve WhatsApp
-- E Instagram ao mesmo tempo. Até agora as credenciais dele existiam só como variáveis
-- de ambiente do Railway: trocar uma exigia deploy e alguém com acesso ao Railway.
--
-- Singleton por construção: `id` tem default 'singleton' e é a chave primária, então uma
-- segunda linha não nasce por acidente.
--
-- Os segredos são gravados criptografados (AES-256-GCM, mesma `ENCRYPTION_KEY` já usada
-- pelo token do Instagram e pela Evolution) e nunca são devolvidos pela API — a tela só
-- recebe prévia mascarada.
--
-- Aditiva e reversível na prática: tabela nova, nada existente muda. A resolução é
-- banco primeiro, variável de ambiente depois — com a tabela vazia, tudo continua
-- lendo o Railway exatamente como antes deste commit.

CREATE TABLE IF NOT EXISTS "meta_app_credentials" (
    "id"                    TEXT         NOT NULL DEFAULT 'singleton',

    -- WhatsApp / nível de aplicativo
    "appId"                 TEXT,        -- público, não é segredo
    "appSecret"             TEXT,        -- criptografado — CHAVE MESTRA
    "configId"              TEXT,
    "coexistenceConfigId"   TEXT,
    "webhookVerifyToken"    TEXT,        -- criptografado
    "graphVersion"          TEXT,

    -- Instagram — mesmo aplicativo, par de credenciais separado
    "igAppId"               TEXT,        -- público
    "igAppSecret"           TEXT,        -- criptografado
    "igWebhookVerifyToken"  TEXT,        -- criptografado

    -- Token de usuário do sistema (opcional): opera a Graph API sem pegar emprestado
    -- o token de um restaurante. Longa duração, alcance grande — criptografado.
    "systemUserToken"       TEXT,        -- criptografado

    -- Resultado do último "Testar conexão", para a tela mostrar estado real e datado
    -- em vez de um selo verde que não prova nada.
    "lastTestAt"            TIMESTAMP(3),
    "lastTestOk"            BOOLEAN,
    "lastTestError"         TEXT,

    "updatedAt"             TIMESTAMP(3) NOT NULL,
    "updatedBy"             TEXT,

    CONSTRAINT "meta_app_credentials_pkey" PRIMARY KEY ("id")
);
