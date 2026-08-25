-- Em que DEGRAU a amostra foi colhida — para poder medir o topo da escada.
--
-- Por que existe (24/08/2026): a escada exigia uma prova que o topo DESLIGA.
-- A evidência de sombra só é gravada quando o agente NÃO está respondendo ao
-- vivo (WhatsAppBrainRuntimeService, ramo `!freeForm.allowed`). Quem sobe para
-- RESTAURANT_WIDE, portanto, para de produzir a prova que o RESTAURANT_WIDE
-- pede: sete dias depois da subida a janela esvazia e o gate marca 0 amostras
-- para sempre. Foi o caso do Sushi Cazza — 0/20 desde 07/2026, não por ter
-- piorado, mas por ter subido.
--
-- Reconferir aquele gate contínuo seria pior que o problema: derruba → volta a
-- acumular → sobe → para de acumular → derruba. Um oscilador, com cliente real
-- balançando junto. A saída é MEDIR NO TOPO: cada turno atendido ao vivo vira
-- amostra, e a taxa de acerto ao vivo é que decide se o degrau se sustenta.
--
-- Três decisões que a coluna sustenta:
--   1. NULLABLE e SEM DEFAULT. Toda linha anterior a esta migração foi colhida
--      em sombra por construção do código — mas quem lê não precisa confiar
--      nisso: a medição do topo conta SÓ o que está explicitamente marcado
--      'LIVE'. Ausência de marca nunca vira medição.
--   2. Os gates de SUBIDA passam a excluir 'LIVE'. Sem isso, amostra colhida no
--      topo viraria prova para subir ao topo — a régua se auto-aprovando.
--   3. O índice cobre a leitura nova: últimas N amostras LIVE de um agente num
--      restaurante, em ordem de tempo.
--
-- Aditiva: coluna nova + índice. Nenhuma linha existente muda de valor.

ALTER TABLE "brain_shadow_logs" ADD COLUMN IF NOT EXISTS "stage" TEXT;

CREATE INDEX IF NOT EXISTS "brain_shadow_logs_restaurantId_agentId_stage_createdAt_idx"
  ON "brain_shadow_logs" ("restaurantId", "agentId", "stage", "createdAt");
