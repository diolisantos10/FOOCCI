-- Capa do cardápio (faixa larga no topo do /qr/[slug], atrás do logo).
--
-- Nasce como recurso de PRODUTO, para todo restaurante — não como enfeite de uma
-- loja de demonstração. É opcional de propósito: sem capa, o cardápio desenha a
-- faixa com o degradê da própria marca (brandPrimaryColor → brandSecondaryColor),
-- que é o caminho da maioria dos restaurantes e tem de ficar bonito.
ALTER TABLE "restaurant_brand_configs"
  ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
