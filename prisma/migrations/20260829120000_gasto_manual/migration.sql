-- ═══════════════════════════════════════════════════════════════════════════
-- GASTO MANUAL — o que nenhuma API entrega
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do CEO em 29/08/2026:
--   "Toda hora estamos gastando com inteligência artificial, crédito, tudo
--    precisa ser medido (…) a gente precisa contabilizar absolutamente tudo
--    que é gasto."
--
-- ── O QUE ESTA MIGRAÇÃO **NÃO** CRIA ──
--
-- Não cria tabela de gasto de IA. Esse dado já existe em `ai_interaction_logs`
-- desde a primeira chamada da casa — modelo, tokens e agente, linha a linha —
-- e o custo é recalculado a partir dele com a tabela de preços auditável de
-- `modelPricing`. Uma segunda tabela seria uma segunda verdade sobre o mesmo
-- fato, e ela começaria a divergir no primeiro log que alguém esquecesse de
-- espelhar.
--
-- Esta tabela é só para o gasto que chega por FATURA e não por API:
-- hospedagem (Railway), Meta/WhatsApp, domínio, ferramentas, imposto.
--
-- ── ADITIVA ──
--
-- Só CREATE. Nenhum ALTER, nenhum DROP, nenhuma coluna de tabela existente é
-- tocada. Rodar isto em produção não muda nada do que já está de pé.
--
-- ── ⚠️ AS TRAVAS SÃO CHECK, E NÃO CONFIANÇA NO APLICATIVO ──
--
-- A validação em TypeScript (`problemaNoGastoManual`) recusa antes de gravar, e
-- é ela que devolve a frase em português para a tela. Mas validação de
-- aplicativo é AVISO: um script de importação, um `psql` colado à mão ou uma
-- rota nova escrita amanhã passam por baixo dela.
--
-- Por isso as duas regras que corrompem a conta de verdade viram CHECK aqui:
--
--   * valor negativo — um gasto de -R$ 500 abate a conta e faz o total mentir
--     para menos, que é a direção errada de errar quando o assunto é despesa;
--   * categoria fora da lista — categoria inventada não aparece em nenhuma
--     quebra da tela, e o gasto some sem deixar buraco visível.
--
-- Guardrail 4: prompt é aviso, código é trava.

CREATE TABLE "gastos_manuais" (
    "id"          TEXT         NOT NULL,
    "descricao"   TEXT         NOT NULL,
    "categoria"   TEXT         NOT NULL,
    "fornecedor"  TEXT,
    -- CENTAVOS INTEIROS. `INTEGER` e não `NUMERIC`: a unidade é o centavo, e não
    -- existe meio centavo a guardar. Um tipo com casas decimais convidaria a
    -- gravar reais em ponto flutuante, que é onde a conta para de fechar com a
    -- fatura no terceiro decimal.
    "valorCent"   INTEGER      NOT NULL,
    "moeda"       TEXT         NOT NULL DEFAULT 'BRL',
    -- DATE, e não TIMESTAMP: competência é um DIA, não um instante. Guardar
    -- instante traria fuso para dentro de um campo que não tem hora, e o gasto
    -- do dia 1º apareceria no dia 31 do mês anterior em toda leitura feita em
    -- UTC.
    "competencia" DATE         NOT NULL,
    "pagoEm"      DATE,
    "recorrente"  BOOLEAN      NOT NULL DEFAULT false,
    "criadoPor"   TEXT         NOT NULL,
    "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_manuais_pkey" PRIMARY KEY ("id")
);

-- Valor negativo não é "estorno": estorno é outro lançamento, com descrição
-- própria e responsável próprio. Um negativo solto abate a conta em silêncio.
ALTER TABLE "gastos_manuais"
  ADD CONSTRAINT "gastos_manuais_valor_nao_negativo" CHECK ("valorCent" >= 0);

-- ⚠️ ESTA LISTA É A MESMA DE `CATEGORIAS_DE_GASTO`, em
-- `src/services/financeiro/gastoManual.ts`. Um teste lê ESTE arquivo e reprova
-- se as duas divergirem — sem ele, alguém acrescenta uma categoria no
-- TypeScript, a tela mostra a opção, e a gravação estoura em produção com um
-- erro de banco que ninguém traduz.
ALTER TABLE "gastos_manuais"
  ADD CONSTRAINT "gastos_manuais_categoria_conhecida" CHECK (
    "categoria" IN ('hospedagem', 'ia', 'mensageria', 'dominio', 'ferramenta', 'imposto', 'outro')
  );

-- Moeda fechada pelo mesmo motivo: a IA é cobrada em dólar e a hospedagem em
-- real. Uma terceira moeda entrando sem ninguém decidir como ela é apresentada
-- viraria um valor sem legenda na tela.
ALTER TABLE "gastos_manuais"
  ADD CONSTRAINT "gastos_manuais_moeda_conhecida" CHECK ("moeda" IN ('BRL', 'USD'));

-- Descrição em branco é a mesma coisa que categoria "outro" sem detalhe: o
-- gasto entra na conta e ninguém consegue dizer o que era seis meses depois.
ALTER TABLE "gastos_manuais"
  ADD CONSTRAINT "gastos_manuais_descricao_nao_vazia" CHECK (btrim("descricao") <> '');

-- A conta do dia é feita por competência; a da categoria, por categoria dentro
-- de um período. Os dois índices são exatamente as duas consultas da tela.
CREATE INDEX "gastos_manuais_competencia_idx" ON "gastos_manuais"("competencia");
CREATE INDEX "gastos_manuais_categoria_competencia_idx" ON "gastos_manuais"("categoria", "competencia");
