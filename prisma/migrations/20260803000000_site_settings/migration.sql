-- Analytics do site comercial da própria Foocci.
--
-- A integração Google que já existia é POR RESTAURANTE (`google_integration_configs`):
-- mostra ao lojista o GA4 dele. Para `foocci.com.br` não havia nada — e as campanhas
-- pagas começaram sem nenhuma medição.
--
-- Lido em tempo de execução de propósito: variável `NEXT_PUBLIC_*` é congelada no build,
-- então trocar o ID exigiria um deploy novo. Quem tem o ID é o CEO, não quem dispara
-- deploy.
--
-- Singleton por construção, igual a `meta_app_credentials`. Todos os campos são públicos
-- por natureza — vão para o navegador de qualquer forma — então não são criptografados.
--
-- Aditiva: tabela nova, nada existente muda. Com a tabela vazia o site não injeta script
-- nenhum e segue exatamente como antes.

CREATE TABLE IF NOT EXISTS "site_settings" (
    "id"                     TEXT         NOT NULL DEFAULT 'singleton',

    "gaMeasurementId"        TEXT,        -- G-XXXXXXXXXX
    "metaPixelId"            TEXT,
    "googleSiteVerification" TEXT,        -- verificação do Search Console por meta tag

    "updatedAt"              TIMESTAMP(3) NOT NULL,
    "updatedBy"              TEXT,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);
