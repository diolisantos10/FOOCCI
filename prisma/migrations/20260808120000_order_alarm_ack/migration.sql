-- "O pedido já foi aceito mas o som continua" (CEO, 08/08/2026).
--
-- A memória de "alguém já agiu neste pedido" vivia dentro de UMA aba do
-- navegador, enquanto a decisão de qual aba apita é entre abas. Aceitar na
-- cozinha não calava o painel; recarregar a página ressuscitava o som.
--
-- ADITIVO e NULÁVEL de propósito. Pedido antigo fica com NULL = "ninguém agiu",
-- que é o lado seguro: o alarme toca. Nada é apagado, nada é reescrito, e não há
-- backfill — carimbar retroativamente seria inventar quem aceitou e quando.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "alarmAckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "alarmAckByUserId" TEXT;
