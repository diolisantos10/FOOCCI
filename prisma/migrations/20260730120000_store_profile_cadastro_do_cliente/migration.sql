-- Cadastro do cliente — quem é o restaurante, não como ele está.
--
-- Buraco concreto que originou isto: para escrever a primeira peça de um
-- cliente foi preciso procurar o @ dele, e não existia em lugar nenhum do
-- sistema. Nem o @, nem o nicho, nem a persona. Cada vez que alguém precisava,
-- perguntava de novo — e a resposta morria no WhatsApp de quem perguntou.
--
-- Aditiva: só colunas novas, todas opcionais. Nada existente muda, e restaurante
-- que já está no ar continua igual até alguém preencher.

ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "instagram"          TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "facebook"           TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "tiktok"             TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "youtube"            TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "website"            TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "googleBusinessUrl"  TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "ifoodUrl"           TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "otherLinks"         JSONB;

ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "niche"              TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "targetPersona"      TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "differentiator"     TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "averageTicketRange" TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "mainCompetitors"    TEXT;
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "brandTone"          TEXT;

ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "leadSource"         TEXT;
-- Anotações da equipe. NUNCA sai numa rota de tenant — só no admin.
ALTER TABLE "store_profiles" ADD COLUMN IF NOT EXISTS "internalNotes"      TEXT;
