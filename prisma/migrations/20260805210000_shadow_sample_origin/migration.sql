-- Origem da amostra de sombra — para nunca somar simulação com vida real.
--
-- Por que existe: a evidência que sustenta a escada de liberação passou a ter
-- mais de uma fonte (sombra ao vivo, replay de conversa real e, desde 05/08, a
-- esteira de treino do CRM com destinatário sintético). Um contador único
-- deixaria "100 amostras" significar coisas diferentes conforme a semana — e a
-- promoção seria decidida sobre um número que ninguém consegue interpretar.
--
-- Três decisões que a coluna sustenta:
--   1. NULLABLE e SEM DEFAULT. As linhas antigas misturam produção e replay e
--      não há como separá-las depois: nulo significa DESCONHECIDO e é contado
--      num balde próprio, nunca como produção.
--   2. O degrau RESTAURANT_WIDE (abrir para clientes reais) só conta amostras
--      PRODUCTION. Treino destrava o primeiro degrau, não o último.
--   3. O índice inclui sampleOrigin porque o gate passou a filtrar por ela.
--
-- Aditiva: coluna nova + índice. Nada existente muda de valor.

ALTER TABLE "brain_shadow_logs" ADD COLUMN IF NOT EXISTS "sampleOrigin" TEXT;

CREATE INDEX IF NOT EXISTS "brain_shadow_logs_restaurantId_agentId_sampleOrigin_createdAt_idx"
  ON "brain_shadow_logs" ("restaurantId", "agentId", "sampleOrigin", "createdAt");
