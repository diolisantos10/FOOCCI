-- Trava do Garçom de IA por plano — passo 3 da OS do cardápio sem IA.
--
-- O plano de entrada não inclui o Garçom. Até agora isso era só texto de contrato:
-- nada no código impedia um restaurante do plano barato de usar a IA — e o token
-- sairia do nosso bolso. Guardrail 4: prompt é aviso, código é trava.
--
-- A coluna é NULA de propósito: NULL = "segue o plano" (STARTER sem IA, os demais
-- com). O UPDATE abaixo é a CLÁUSULA DE AVÔ, e é a linha mais importante do
-- arquivo: o Sushi Cazza — o cliente vivo — é plano STARTER **com** o Garçom
-- rodando em produção. Uma trava só-por-plano desligaria a IA dele no instante do
-- deploy (guardrail 5: a proteção não pode ser mais destrutiva que o problema).
-- Todo restaurante que EXISTE no momento do rollout mantém a IA; a regra de plano
-- vale para quem entrar depois.

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "aiWaiterEnabled" BOOLEAN;

UPDATE "restaurants" SET "aiWaiterEnabled" = true WHERE "aiWaiterEnabled" IS NULL;
