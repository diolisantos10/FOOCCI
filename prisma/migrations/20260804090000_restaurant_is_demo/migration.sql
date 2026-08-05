-- Marca de DEMONSTRAÇÃO no restaurante — Frente 3 do lançamento (padaria jogável).
--
-- A "Foocci Bakery" é um restaurante completo e funcional dentro do sistema, para
-- o visitante do site degustar mesa/loja/IA antes de comprar. Ela precisa ser um
-- tenant de verdade (senão não demonstra nada) e ao mesmo tempo NUNCA pode ser
-- contada como cliente em cobrança, relatório comercial ou métrica de base.
--
-- Por que coluna e não convenção de slug: guardrail 4 — prompt é aviso, código é
-- trava. Uma regra que só existe no nome do slug morre na primeira renomeação e
-- não pode ser usada como filtro de banco.
--
-- Default false: todo restaurante que já existe continua sendo cliente real. Não
-- há cláusula de avô a escrever aqui — nenhum tenant vivo é demo hoje.

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
