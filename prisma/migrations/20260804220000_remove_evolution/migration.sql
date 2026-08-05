-- Remoção da Evolution do Foocci — ordem do CEO em 04/08/2026, repetida três vezes.
--
-- A Evolution foi uma muleta usada enquanto a homologação da Meta não saía. A
-- homologação saiu, o CEO confirmou que NENHUM restaurante dependia mais dela, e
-- todo o código foi extraído. Isto aqui é o último passo: o banco.
--
-- ⚠️ IRREVERSÍVEL. Esta migração APAGA dados, não só estrutura:
--   · "evolution_configs" guarda as credenciais (baseUrl, apiKey cifrada) de cada
--     instância. Apagar é também higiene de segurança: credencial de serviço
--     aposentado que fica no banco é superfície de ataque sem dono.
--   · "evolution_webhook_event_logs" guarda o histórico bruto de eventos
--     recebidos. Esse histórico se perde. Nenhum código lê essas tabelas desde a
--     extração.
--
-- As três colunas de "restaurants" escolhiam entre dois provedores e para onde
-- cair em caso de falha. Não há mais segundo provedor: manter a coluna seria
-- manter a ilusão de uma escolha que não existe — e foi justamente o valor
-- "EVOLUTION" deixado nela que fazia uma falha de banco desviar o envio para o
-- canal não homologado.
--
-- ⚠️ NOME DE TABELA ≠ NOME DE MODELO — o erro que custou o primeiro deploy.
-- A primeira versão desta migração usou "Restaurant", "EvolutionConfig" e
-- "EvolutionWebhookEventLog": os nomes dos MODELOS do Prisma. O banco não os
-- conhece. Todo modelo deste schema tem @@map, e as tabelas reais são
-- "restaurants", "evolution_configs" e "evolution_webhook_event_logs".
-- O deploy morreu em `42P01: relation "Restaurant" does not exist`, o container
-- parou e o Railway manteve a versão antiga no ar — produção se protegeu, mas o
-- deploy foi reportado como sucesso porque o teste seguinte só pedia um HTTP 200,
-- e a versão VELHA responde 200. Quem escrever SQL à mão aqui: confira o @@map.

ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "whatsappProvider";
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "allowWhatsAppProviderFallback";
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "fallbackProvider";

DROP TABLE IF EXISTS "evolution_webhook_event_logs";
DROP TABLE IF EXISTS "evolution_configs";
