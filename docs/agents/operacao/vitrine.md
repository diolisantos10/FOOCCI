# Vitrine — operação

> Curada pelo PM. Qualquer agente lê; **só o PM escreve**.

---

## `MenuItem` não tem `restaurantId` — o escopo é pela categoria

O multi-tenant do item se faz por `category: { restaurantId }`.

**Toda query nova de item que esquecer isso vaza dado entre restaurantes — e passa
no `tsc` sem reclamar uma linha.** É o tipo de erro que só aparece quando um
lojista vê o prato de outro.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-cmv-precificacao.md` §5.3 (commit `36a36597`)

---

## Ficha técnica completa TRAVA o custo manual — e isso é intencional

Quando **todas** as linhas da ficha têm quantidade e **todos** os insumos têm
custo, o `RecipeCostService` recalcula e **sobrescreve `MenuItem.cost`** (auditado
como `RECIPE`), e a aba Preços desabilita o campo ("🧾 pela ficha").

Voltar a editar na mão exige **quebrar a ficha** — remover uma quantidade ou uma
linha. É comportamento desenhado, não bug.

**Os três estados possíveis do custo de um produto:**

| Estado | Como | Gera sugestão? |
|---|---|---|
| **Manual** | digitado na aba Preços · log `COST_EDIT` | sim |
| **Pela ficha** | calculado · log `RECIPE` · trava o manual | sim |
| **Nulo** | "Sem custo" | **nunca** |

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-cmv-precificacao.md` §5.6 e §6.4 (commit `36a36597`)

---

## A trava segura o PREÇO, nunca o CUSTO

Num salto de +81% no insumo, **o custo do produto atualiza na hora** — o CMV real
fica visível imediatamente. **Só o preço espera aprovação.**

Detalhes que é fácil errar:
- `ON_TARGET` tem **tolerância de 2%** (`classifyPrice`) para não pipocar sugestão
  por centavos
- **"Aplicar sugeridos" em massa inclui só itens ABAIXO do ideal.** Item acima tem
  botão individual — baixar preço em massa foi considerado perigoso demais

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-cmv-precificacao.md` §6.3 (commit `36a36597`)

---

## A ordem do dispositivo importa — e passar por fora perde auditoria

**custo muda → ficha recalcula → SÓ ENTÃO o reprice roda.** Uma chamada
(`updateCostsWithReprice`) encadeia tudo.

**Nunca escreva `menuItem.update({ cost })` direto** — perde auditoria e
automação. Se criar um terceiro caminho de custo (por exemplo, o importador de
planilha corrigido), passe por aquela função com o `costSource` certo.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-cmv-precificacao.md` §5.9 e §6.6 (commit `36a36597`)

---

## Dinheiro é `Decimal` do Prisma — a conversão é do chamador

Todo o schema usa `Decimal`. A fronteira RSC/route converte para `number`
**explicitamente, campo a campo**. O `PricingEngine` só aceita `number`.

Conversão é responsabilidade de quem chama, não do motor.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-cmv-precificacao.md` §5.8 (commit `36a36597`)

---

## O parser de ingredientes divide por " e " e " com " — pode picar demais

`IngredientParser` separa por vírgula, ponto-e-vírgula, quebra de linha, barra
**e pelas conjunções "e" / "com"**.

Consequência: *"Hot roll com geleia"* vira **dois insumos**. Para o piloto isso
acertou; para nome composto com "com" no meio, pica demais.

**Se um restaurante reclamar de insumo picado, o ajuste é na `CONJUNCTION_REGEX`.**

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-cmv-precificacao.md` §6.5 (commit `36a36597`)

---

## Dois documentos na raiz mentem — são de abril

`FICHA_TECNICA.md` e `HANDOFF_PARA_IA.md` citam **outro nome de repositório** e
regras superadas. Use como contexto histórico, **nunca como verdade**.

O mapa atualizado desta frente é o `HANDOFF-cmv-precificacao.md` mais
`docs/cmv-precificacao-backlog.md`.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-cmv-precificacao.md` §5.2 (commit `36a36597`)
