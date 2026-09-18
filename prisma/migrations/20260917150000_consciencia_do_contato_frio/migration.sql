-- ═══════════════════════════════════════════════════════════════════════════
-- A CONSCIÊNCIA DO CONTATO FRIO — 17/09/2026
--
-- Ordem do CEO: *"A lista fria não é lead. Ela só é lead quando se interessa
-- sobre o produto e quer escutar. Isso precisa estar cristalino em todos os
-- cantos do departamento comercial."*
--
-- A base não sabia dizer a diferença. `SiteLead.fonte` guarda a PORTA DE ENTRADA
-- e nunca muda — então um restaurante que nós fomos caçar na internet e um
-- restaurante que preencheu o formulário ficavam indistinguíveis assim que a
-- conversa começava. Faltava o instante da promoção.
--
-- ⚠️ ADITIVA, E ISSO NÃO É ESTILO: É ORDEM.
--
-- Há 750 contatos abordados no funil agora. Empilhar, não substituir.
--   • nenhum DROP, nenhum RENAME, nenhum NOT NULL em coluna existente;
--   • as duas colunas nascem NULLABLE e sem default — `null` quer dizer
--     "ninguém promoveu", que é o estado verdadeiro de toda a base hoje.
--
-- Roda duas vezes sem quebrar e sem duplicar (`IF NOT EXISTS`).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "virouLeadEm" TIMESTAMP(3);
ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "virouLeadMotivo" TEXT;

-- A fila "quem já é lead de verdade" é lida por data, e ela é a fila que o
-- vendedor abre primeiro.
CREATE INDEX IF NOT EXISTS "SiteLead_virouLeadEm_idx" ON "SiteLead" ("virouLeadEm");
