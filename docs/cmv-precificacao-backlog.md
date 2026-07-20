# CMV & Precificação — Backlog

> Fonte oficial do que está feito e do que vem a seguir nesta área.
> Mantido pelo chat dedicado de CMV/Precificação.
> Atualize este arquivo ao concluir ou repriorizar itens.

## ✅ Entregue (v1 — 19/07/2026, commit `551a800`)

1. **Página `/precificacao`** no painel do lojista (grupo Vendas), em 3 blocos:
   - **Custos & Fórmula** — premissas do negócio (faturamento, fixas R$→%,
     impostos/taxas, margem) → markup ao vivo `100 ÷ [100 − Σ%]` + termômetro
     de CMV do período contra a faixa saudável do setor (25–35%).
   - **Preços do cardápio** — custo unitário editável por item (individual/massa),
     CMV%, preço ideal, status (Subir / No alvo / Margem extra), aplicar 1 a 1
     ou em massa com confirmação.
   - **Automação** — dispositivo de reprecificação: Desligado / **Sugerir
     (padrão)** / Automático; arredondamento **,90 (padrão)** | ,99 | exato;
     trava de variação (15% default); histórico completo de auditoria.
2. **Fundação de dados** (migration aditiva `20260719120000_cmv_pricing`):
   `MenuItem.cost` (opcional), `RestaurantPricingConfig` (1:1),
   `PriceChangeLog` (sem FK para itens — auditoria sobrevive a exclusões).
3. **Motor puro** `PricingEngine.ts` (24 testes unitários) + `RepriceService.ts`.
   Segurança: preço sugerido nunca abaixo do custo; servidor sempre recalcula
   (cliente não envia preço); mutations só OWNER/MANAGER; multi-tenant.
4. **Verificação**: migration validada contra schema antigo (zero drift no
   `prisma migrate diff`) + 23 checks E2E em Postgres real (Sugerir não toca
   preço; Automático aplica +6% e retém −22%/+45% na trava; auditoria; tenant).

## ✅ Entregue (2ª leva — 20/07/2026)

5. **Aba Insumos** em `/precificacao` — catálogo de ingredientes por restaurante:
   - **Importação automática do cardápio** na primeira visita (parser do campo
     `ingredients` dos produtos: vírgulas, "e"/"com", quebras; Title Case;
     dedupe entre produtos) + botão "↻ Importar do cardápio" (idempotente).
   - Custo por unidade (4 casas — R$/g, R$/ml), unidade, cadastro manual,
     exclusão com confirmação quando em uso.
   - **Ficha por produto**: quantidades por insumo; ficha completa → custo do
     produto **calculado e propagado automaticamente** (auditoria `RECIPE`),
     entrando direto no dispositivo Sugerir/Automático + trava. Ficha
     incompleta → vale o custo digitado (aba Preços mostra "🧾 pela ficha" e
     bloqueia edição manual quando a ficha assume).
   - Modelos `Ingredient` + `RecipeLine` (migration aditiva
     `20260719200000_ingredients_recipe`); 22 checks E2E em Postgres real.

## 🔜 Próximas fases (ordem sugerida)

- **P1 — Corrigir importador de planilhas** *(pequeno)* — hoje
  `/api/menu/import` (`PRECO_PREFIXES`, linha ~56) trata coluna "custo"/"cost"
  como **preço de venda**. Mapear para `MenuItem.cost` + permitir importação de
  custos em massa via planilha. É o caminho rápido para o lojista carregar
  todos os custos de uma vez.
- **P2 — Lucro no Analytics** *(médio)* — `AnalyticsAgentService.ts:213` ainda
  responde "não temos CMV cadastrado"; com `MenuItem.cost` no banco, calcular
  lucro/margem por dia, produto e categoria no cockpit e no agente de analytics.
- **P3 — Preço ideal por canal** *(médio)* — `priceDelivery/DineIn/Ifood` já
  existem no schema; embutir a taxa de cada canal (iFood 12–27%) na fórmula e
  sugerir o ideal por canal, não só o preço base.
- **P4 — Engenharia de cardápio** *(médio)* — matriz popularidade × margem com
  vendas reais (`ProductSalesAggregate`): Estrela / Cavalo de corrida /
  Quebra-cabeça / Abacaxi + recomendações por quadrante (metodologia aumenta
  lucro 10–15%).
- **P5 — IA vendendo margem real** *(médio)* — trocar o `marginProxy` do
  `UpsellEngine` pela margem real derivada de `MenuItem.cost`; o agente do
  WhatsApp passa a priorizar os itens que mais deixam dinheiro.
- **P6 — Alertas de CMV no WhatsApp do dono** *(pequeno)* — CMV do período
  estourou a faixa saudável → mensagem proativa.
- **P7 — Custo por variação** *(pequeno/médio)* — hoje o custo é do item base;
  adicionar `cost` em `MenuItemVariant` com herança (mesmo padrão dos preços).
- **P8 — Ficha técnica completa** *(médio — v1 já entregue na 2ª leva)* —
  evoluções restantes: rendimento/perda por receita (fator de correção),
  preço por embalagem de compra (ex.: caixa 2 kg → custo/g automático),
  histórico de custo do insumo, e integração futura com estoque.

## 📌 Decisões tomadas (aprovadas pelo dono em 19/07 — não rediscutir)

- Modo padrão do dispositivo: **Sugerir** (Automático existe, mas o lojista liga).
- Arredondamento padrão: **final ,90**, sempre para cima.
- v1 usa **custo digitado por item**; ficha técnica de insumos é a P8.
- Trava do Automático: **15%** default, configurável na página.
- Histórico de preços **sem FK** para `menu_items` (auditoria é imutável).
