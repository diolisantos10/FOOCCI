-- Remoção da Evolution do Foocci — ordem do CEO em 04/08/2026, repetida três vezes.
--
-- A Evolution foi uma muleta usada enquanto a homologação da Meta não saía. A
-- homologação saiu, o CEO confirmou que NENHUM restaurante dependia mais dela, e
-- todo o código foi extraído. Isto aqui é o último passo: o banco.
--
-- ⚠️ IRREVERSÍVEL. Esta migração APAGA dados, não só estrutura:
--   · "EvolutionConfig" guarda as credenciais (baseUrl, apiKey cifrada) de cada
--     instância. Apagar é também higiene de segurança: credencial de serviço
--     aposentado que fica no banco é superfície de ataque sem dono.
--   · "EvolutionWebhookEventLog" guarda o histórico bruto de eventos recebidos.
--     Esse histórico se perde. Nenhum código lê essas tabelas desde a extração.
--
-- As três colunas de Restaurant escolhiam entre dois provedores e para onde cair
-- em caso de falha. Não há mais segundo provedor: manter a coluna seria manter a
-- ilusão de uma escolha que não existe — e foi justamente o valor "EVOLUTION"
-- deixado nela que fazia uma falha de banco desviar o envio para o canal não
-- homologado.

ALTER TABLE "Restaurant" DROP COLUMN IF EXISTS "whatsappProvider";
ALTER TABLE "Restaurant" DROP COLUMN IF EXISTS "allowWhatsAppProviderFallback";
ALTER TABLE "Restaurant" DROP COLUMN IF EXISTS "fallbackProvider";

DROP TABLE IF EXISTS "EvolutionWebhookEventLog";
DROP TABLE IF EXISTS "EvolutionConfig";
