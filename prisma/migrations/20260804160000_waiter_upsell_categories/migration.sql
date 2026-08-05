-- Categorias de upsell do fechamento viram configuração do restaurante.
--
-- ADITIVA e sem mudança de comportamento no dia do deploy.
--
-- Antes, a sequência de oferta no fechamento era constante no código: "bebida"
-- e depois "sobremesa", reconhecidas por regex sobre o nome da categoria. Quando
-- a taxonomia do restaurante não batia com a regex — uma padaria não tem
-- "sobremesa", tem "Confeitaria" — o passo não acontecia e ninguém era avisado:
-- dinheiro deixado na mesa em todo pedido, em silêncio.
--
-- O DEFAULT é array VAZIO de propósito: vazio significa "use o padrão legado"
-- (bebida → sobremesa derivado do cardápio), não "não ofereça nada". Todo
-- restaurante já existente nasce com a coluna vazia e continua com exatamente o
-- comportamento de hoje — a configuração é opt-in do lojista.
ALTER TABLE "restaurant_brand_configs"
  ADD COLUMN "waiterUpsellCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
