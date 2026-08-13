-- Bloqueio de ciclo inteiro deixa rastro.
--
-- Canal caído, cadência (intervalo mínimo entre ciclos) e disjuntor param TODAS
-- as campanhas do restaurante ao mesmo tempo. Nenhum deles gera
-- `campaign_executions` — não há destinatário a gravar, porque nada foi tentado.
-- O motivo existia só como string em memória + console.log, então o painel
-- mostrava zero sem causa e o lojista lia isso como "mercado fraco".
--
-- NULO = sem bloqueio agora (nunca houve, ou já foi resolvido). Nunca 0, nunca
-- string vazia: "não medido" e "medido zero" não podem colidir.
ALTER TABLE "campaigns" ADD COLUMN "lastBlockedAt"   TIMESTAMP(3);
ALTER TABLE "campaigns" ADD COLUMN "lastBlockReason" TEXT;
