-- As origens multicanal que faltavam, SOZINHAS nesta migration.
--
-- ── POR QUE SEPARADA DAS TABELAS ────────────────────────────────────────────
--
-- O Prisma envolve cada migration numa transação, e `ALTER TYPE ... ADD VALUE`
-- convive mal com transação: em PostgreSQL 11 é proibido, e em versões
-- posteriores só passa porque os valores novos não são USADOS no mesmo bloco.
-- Depender dessa sutileza para subir o banco de produção é apostar na versão do
-- servidor. Separar custa um arquivo e remove a aposta.
--
-- Sem LISTA_PROSPECCAO não existe como distinguir quem nos procurou de quem nós
-- procuramos — e essa diferença governa consentimento, tom e cadência.
ALTER TYPE "SiteLeadSource" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "SiteLeadSource" ADD VALUE IF NOT EXISTS 'FACEBOOK';
ALTER TYPE "SiteLeadSource" ADD VALUE IF NOT EXISTS 'CAMPANHA_PAGA';
ALTER TYPE "SiteLeadSource" ADD VALUE IF NOT EXISTS 'LISTA_PROSPECCAO';
ALTER TYPE "SiteLeadSource" ADD VALUE IF NOT EXISTS 'IMPORTACAO';
