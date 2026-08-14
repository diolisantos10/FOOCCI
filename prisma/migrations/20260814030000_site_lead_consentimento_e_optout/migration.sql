-- LGPD do lead do site: consentimento com prova, e silêncio com freio.
--
-- POR QUE EXISTE. `docs/sdr-foocci-desenho.md` (05/08/2026) fechou que preencher o
-- formulário BASTA juridicamente — a política já declara a finalidade. O que
-- faltava era outra coisa: **prova e freio**.
--
--   1. o aceite não era registrado (nem data, nem versão da política);
--   2. não existia opt-out para lead — o detector de "PARE" grava na tabela de
--      cliente de restaurante, e um lead do site não tem uma.
--
-- Sem estas colunas, o SDR só teria dois caminhos: mandar sem saber (proibido) ou
-- nunca mandar. Elas são o que permite ao portão responder "sim" com lastro.
--
-- ADITIVA E SEGURA: quatro colunas opcionais, nenhuma linha existente muda, nenhum
-- default preenchido de ofício. Contato antigo fica com `consentAt` NULL, e o
-- portão usa `createdAt` — que é literalmente o instante do envio do formulário.
-- Preencher consentimento por migração seria inventar um aceite que ninguém deu.

ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "consentAt"            TIMESTAMP(3);
ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "consentPolicyVersion" TEXT;
ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "optOutAt"             TIMESTAMP(3);
ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "optOutCanal"          TEXT;

-- "Quem pediu silêncio" é a primeira pergunta de toda seleção do SDR. Sem índice,
-- ela vira varredura da base inteira toda vez que alguém abre a fila.
CREATE INDEX IF NOT EXISTS "SiteLead_optOutAt_idx" ON "SiteLead"("optOutAt");
