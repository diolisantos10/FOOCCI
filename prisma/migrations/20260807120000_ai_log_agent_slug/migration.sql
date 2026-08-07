-- Custo de IA por agente — a Sala dos Agentes precisa responder "quanto ESTA IA
-- já gastou", e hoje o log não sabe de qual agente veio a chamada.
--
-- NULÁVEL de propósito. Linha antiga fica nula e aparece na tela como
-- "não atribuído" — nunca somada ao agente errado. Backfill de histórico seria
-- adivinhação: "não sei de quem foi" e "foi do waiter" são coisas diferentes.
ALTER TABLE "ai_interaction_logs"
  ADD COLUMN IF NOT EXISTS "agentSlug" TEXT;

CREATE INDEX IF NOT EXISTS "ai_interaction_logs_agentSlug_idx"
  ON "ai_interaction_logs" ("agentSlug");
