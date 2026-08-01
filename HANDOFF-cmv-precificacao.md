# HANDOFF — CMV & Precificação (`/precificacao`)

> Documento de transferência da frente de **CMV, precificação por markup,
> insumos/ficha técnica e importador de nota**. Escrito em 20/07/2026 ao fim
> da sessão que construiu a frente inteira (19–20/07/2026).
> Repositório: `diolisantos10/FOOCCI` · Branch de trabalho: `claude/remove-legacy-runner-q8iXa`.
> ⚠️ Repositório público — este documento não contém segredos; credenciais são
> sempre `<credencial em variável de ambiente>`.
> Backlog vivo da área: `docs/cmv-precificacao-backlog.md` (fonte oficial do
> que está feito e do que vem). Este handoff NÃO substitui o backlog — ele
> registra o que não está escrito em lugar nenhum.

---

## 1. O que é o projeto e a stack REAL (lida do package.json em 20/07/2026)

FOOCCI é um SaaS multi-tenant de CRM para restaurantes com agente de IA que
vende pelo WhatsApp. Esta frente adicionou a página **CMV & Precificação**
(`/precificacao`, grupo Vendas do painel do lojista) com 5 abas: Custos &
Fórmula, Markup, Preços do cardápio, Insumos e Automação.

| Camada | Real |
|---|---|
| Framework | Next.js **14.2.35** (App Router) + React 18.3 + TypeScript strict |
| Banco | PostgreSQL via Prisma `^5.16.1` (instalado resolve para 5.22.x) |
| Auth | next-auth `^4.24.7` (JWT; middleware injeta `x-restaurant-id`/`x-user-id`/`x-user-role`) |
| IA | openai `^6.29.0` + @anthropic-ai/sdk `^0.111.0` — **sempre via Brain** (ver armadilha 5.5) |
| Validação | zod `^3.23.8` |
| UI | Tailwind `^3.4.6` + kit próprio em `src/components/ui` (sem shadcn/MUI) |
| Testes | Vitest (`npm run test:unit`, arquivos `src/**/*.test.ts`) + Playwright (e2e, não usado nesta frente) |
| Deploy | Railway/Nixpacks, Node 18; `scripts/start-production.sh` roda `prisma migrate deploy` no boot |

Arquivos-chave desta frente:

- `src/services/menu/PricingEngine.ts` — matemática pura (markup, ideal, CMV, arredondamento). 24 testes.
- `src/services/menu/RepriceService.ts` — dispositivo (SUGGEST/AUTO/OFF, trava, auditoria, markup por categoria).
- `src/services/menu/RecipeCostService.ts` — insumos + ficha por produto + propagação de custo.
- `src/services/menu/IngredientParser.ts` / `InvoiceMatchService.ts` — parsers puros (testados).
- `src/services/menu/InvoiceExtractService.ts` — leitura de nota por IA (via Brain).
- `src/app/api/pricing/**` — config, costs, apply, history, markup, ingredients (+`[id]`, `import`, `import-invoice`), recipe.
- `src/app/(dashboard)/precificacao/` — `page.tsx` (RSC) + `PrecificacaoClient.tsx` (~2000 linhas, todas as abas).
- Migrations: `20260719120000_cmv_pricing`, `20260719200000_ingredients_recipe`, `20260720090000_category_markup_override` — todas aditivas.

## 2. Decisões tomadas (com data e PORQUÊ)

1. **Modo padrão do dispositivo = SUGERIR, não Automático** (19/07, aprovado
   pelo dono). Porquê: preço alterado vale NA HORA para o agente de vendas do
   WhatsApp — errar preço em produção é perda direta de margem ou de venda.
   Automático existe, mas é opt-in com diálogo de confirmação extra.
2. **Arredondamento padrão ,90, sempre PARA CIMA** (19/07, aprovado pelo
   dono). Porquê: padrão do setor; arredondar para baixo comeria a margem que
   a fórmula acabou de garantir. `roundPrice` nunca desce.
3. **v1 com custo digitado por item; ficha técnica veio depois como camada**
   (19/07). Porquê: entregável em 1 dia e utilizável de imediato; a ficha
   (20/07) SOBREPÕE o custo digitado apenas quando completa — os dois modelos
   convivem sem migração de dados.
4. **Sugestões de preço são derivadas on-the-fly, sem tabela de pendências**
   (19/07). Porquê: menos estado para sincronizar; a "pendência" é
   simplesmente `preço atual ≠ ideal calculado`. Não crie tabela de sugestões
   sem motivo forte — foi escolha, não esquecimento.
5. **`PriceChangeLog` NÃO tem FK para `menu_items`** (19/07). Porquê:
   auditoria precisa sobreviver à exclusão do item (cascade apagaria o
   histórico). `itemName` é desnormalizado de propósito.
6. **Trava `maxAutoChangePct` (15% default) vale SÓ para o modo Automático**
   (19/07). Porquê: clique explícito do lojista já tem confirmação na UI;
   travar também o manual criaria beco onde nenhum preço muito defasado
   poderia ser corrigido.
7. **Markup por categoria = multiplicador direto (`markupOverride`), não uma
   margem-alvo por categoria** (20/07). Porquê: o dono e o mercado falam em
   "bebida é 4×"; e o override funciona mesmo sem premissas globais
   preenchidas (restaurante pode começar pelo simples).
8. **Config sem premissas → markup global nulo → nenhuma sugestão** (19/07).
   Porquê: com tudo zerado a fórmula daria markup 1,0× e a página sugeriria
   baixar todos os preços ao nível do custo — desastre no primeiro acesso.
9. **Leitura de nota passa pelo Brain (`selectEngine("invoice-reader")` +
   `callStructuredJson`), com `imageDataUrl` adicionado ao contrato do motor**
   (20/07). Porquê: a Regra de Ouro do repositório (Lei 1) proíbe importar a
   IA direto e o teste `src/services/brain/architecture.test.ts` QUEBRA O
   BUILD se violada. Suporte a imagem hoje só no piloto OPENAI; CLAUDE/GEMINI
   lançam erro claro.
10. **IA da nota NUNCA aplica preço — tela de revisão obrigatória** (20/07).
    Porquê: extração de cupom amassado erra; o custo de um falso positivo é
    preço errado no cardápio inteiro (via ficha + automático). A aplicação
    reusa o endpoint PATCH de insumos já auditado.
11. **Custo de insumo em `Decimal(12,4)` (4 casas), custo/preço de produto em
    `Decimal(10,2)`** (20/07). Porquê: R$/g e R$/ml precisam de 4 casas
    (salmão a 0,09/g); preço de venda não.
12. **Importação de insumos do cardápio roda sozinha na 1ª visita quando o
    catálogo está vazio** (20/07, pedido do dono: "já vai puxar tudo").
    Idempotente e aditiva; o botão "↻ Importar do cardápio" repete sem duplicar.

## 3. O que foi tentado e NÃO funcionou (não repita)

1. **`prisma migrate deploy` em banco ZERADO falha** — uma migration antiga
   do repositório referencia a tabela `orders` antes de qualquer migration
   criá-la ("relation orders does not exist"). O histórico de migrations não
   reconstrói um banco do zero (provável uso de `db push` no passado).
   Produção funciona porque o banco já existe (não confirmado). Para validar
   migrations novas localmente, o caminho que funcionou: `prisma db push` com
   o schema ANTIGO (`git show HEAD:prisma/schema.prisma`) num banco limpo →
   aplicar só o SQL novo via psql → `prisma migrate diff --from-url ...
   --to-schema-datamodel prisma/schema.prisma --script` e exigir "empty
   migration".
2. **Importar `@/lib/openai` num serviço novo** — o build passa no tsc mas o
   teste de arquitetura reprova e o ESLint (`no-restricted-imports`) derruba o
   `next build`. Foi exatamente o que aconteceu com a 1ª versão do
   `InvoiceExtractService`; a correção foi estender o contrato do motor do
   Brain (decisão 9), não contornar a regra.
3. **Commitar na branch local sem `git fetch` + rebase antes** — a branch
   remota anda VÁRIAS vezes ao dia (outras sessões de IA commitam direto
   nela). Um commit feito sobre branch local desatualizada foi rejeitado no
   push e o checkout da branch velha ainda reverteu arquivos na working tree
   no meio do trabalho. Rotina obrigatória: `git fetch origin <branch> && git
   rebase origin/<branch>` antes de todo push.
4. **Confiar que a branch remota builda** — chegou commit de outra sessão com
   erro de lint (aspas sem escape em JSX no CRM) que quebrava `next build`.
   Lint ERROS derrubam o build de produção neste projeto, não são warnings.
   Rode `npm run build` completo antes de push, mesmo que "só" tenha mexido em
   outra área.
5. **Supor "medium confidence" no matcher para nome do catálogo contido no
   nome da nota** — o algoritmo de containment dá razão ao match total do
   conjunto menor ("Cream Cheese" ⊂ "QUEIJO CREAM CHEESE TRADICIONAL" = high,
   e está certo). O teste inicial esperava o contrário e estava errado.
6. **`git push --force-with-lease` NÃO protege depois de um `git fetch`** —
   aconteceu nesta sessão, no push deste próprio documento: fetch atualizou a
   ref local (o "lease" passou a bater com o remoto), o `git rebase ... |
   tail -1` MASCAROU a falha do rebase (o exit code vira o do tail), e o
   force push substituiu o head remoto descartando por minutos um merge de
   outra sessão (restaurado em seguida, nada se perdeu). Lições: (a) neste
   repositório multi-sessão, evite `--force-with-lease` — se o push normal
   for rejeitado, rebase e tente de novo; (b) nunca encadeie `rebase |
   tail` com `&&` — o pipe engole o erro; (c) após QUALQUER force push,
   confira com `git merge-base --is-ancestor <head-antigo-remoto> HEAD`.

## 4. O que ficou ABERTO (e o que quebra se ninguém mexer)

1. **Importador de planilha trata coluna "custo" como PREÇO DE VENDA**
   (`src/app/api/menu/import/route.ts`, `PRECO_PREFIXES` ~linha 56, pré-existente).
   Se um lojista importar planilha com coluna "custo" esperando alimentar o
   CMV, **sobrescreve os preços de venda do cardápio inteiro** — perda real.
   Corrigir o mapeamento para `MenuItem.cost` é o P1 do backlog.
2. **Agente de analytics ainda responde "não temos CMV cadastrado"**
   (`src/services/analytics/AnalyticsAgentService.ts:213` + cenário de teste
   `analyticsScenarios.ts:481`). Agora o dado EXISTE; enquanto ninguém mexer,
   o agente nega um dado que o lojista acabou de preencher — parece bug para
   o cliente. (P2 do backlog: lucro no Analytics.)
3. **Variações (`MenuItemVariant`) não têm custo** — a precificação usa só o
   preço/custo base do item. Restaurante com cardápio fortemente baseado em
   variações verá CMV/ideal incompletos. Nada quebra, mas o número mente por
   omissão. (P7 do backlog.)
4. **Leitura de nota não testada com nota real** — não havia
   `<credencial em variável de ambiente>` (OpenAI) no ambiente desta sessão;
   o caminho de IA foi testado só até o contrato (parser de resposta e
   matcher têm testes; a chamada real, não). Primeiro teste em produção pode
   revelar prompt fraco para cupons amassados — se acontecer, defina
   `INVOICE_EXTRACT_MODEL=gpt-4o` (default é o modelo do Brain, gpt-4o-mini).
5. **Suporte a imagem só no piloto OPENAI** — se o roteamento governado do
   Brain mover o agente `invoice-reader` para CLAUDE/GEMINI, a leitura de
   nota passa a falhar com erro claro (proposital). Implementar imagem nos
   outros adapters quando necessário.
6. **CMV do período é manual** (estoque inicial/compras/estoque final
   digitados no Bloco A). Sem integração com compras/estoque, o termômetro só
   vale quando o lojista atualiza — risco de leitura velha, não de quebra.

## 5. Armadilhas DESTE repositório

1. **A branch principal tem nome de feature**: `claude/remove-legacy-runner-q8iXa`
   é a default branch e a linha de produção. O dono trabalha trunk-based e
   NÃO usa PRs (um PR meu foi dispensado; o pedido explícito foi push direto).
   Não crie branches de feature sem pedido expresso.
2. **Docs antigos mentem**: `FICHA_TECNICA.md` e `HANDOFF_PARA_IA.md` (raiz)
   são de abril/2026, citam outro nome de repositório e regras superadas.
   Use-os como contexto histórico, não como verdade. O mapa atualizado desta
   frente é este arquivo + `docs/cmv-precificacao-backlog.md`.
3. **`MenuItem` não tem `restaurantId`** — o escopo multi-tenant é via
   `category: { restaurantId }`. Toda query nova de item que esquecer isso
   vaza dados entre restaurantes e passa no tsc sem reclamar.
4. **Lint quebra o build** (não só o CI): `next build` = tsc strict + ESLint
   com `react/no-unescaped-entities` e `no-restricted-imports` como ERRO.
5. **Regra de Ouro do Brain**: nenhum arquivo fora de
   `src/services/brain/engines/**` pode importar `@/lib/openai`/SDKs de IA.
   O teste `architecture.test.ts` varre os imports e falha o CI. Use
   `selectEngine(agentId)` + `callStructuredJson()`.
6. **Ficha completa TRAVA o custo manual**: quando todas as linhas da ficha
   têm quantidade e todos os insumos têm custo, `RecipeCostService` recalcula
   e SOBRESCREVE `MenuItem.cost` (auditado como `RECIPE`), e a aba Preços
   desabilita o input ("🧾 pela ficha"). Editar o custo na mão de novo exige
   quebrar a ficha (remover quantidade/linha) — comportamento intencional.
7. **`ALTER TYPE ... ADD VALUE` em migration**: funciona dentro da transação
   do Prisma no PG ≥ 12, MAS o valor novo não pode ser usado na MESMA
   migration. A migration de insumos respeita isso; mantenha o padrão.
8. **Dinheiro é `Decimal` do Prisma** em todo o schema; a fronteira
   RSC/route converte para `number` explicitamente campo a campo. O motor
   (`PricingEngine`) só aceita `number` — conversão é responsabilidade do
   chamador.
9. **Ordem importa no dispositivo**: custo muda → ficha recalcula → SÓ ENTÃO
   o reprice roda (uma chamada, `updateCostsWithReprice`, encadeia tudo).
   Chamar reprice por fora do serviço perde auditoria e trava.
10. **Node 18 no Railway** com avisos `EBADENGINE` de `@aws-sdk`/`pdf-parse`
    — são warnings conhecidos, não erros; não "conserte".

## 6. O que eu sei e NÃO está escrito em lugar nenhum

1. **Como o dono trabalha**: briefs ditados por voz em PT-BR (com ruído de
   transcrição — "marcape" = markup, "lagacy" = legacy). O fluxo que funciona:
   (1) confirmar o entendimento em bullets ANTES de construir; (2) construir
   no mesmo dia; (3) responder com resumo executivo curto — ele pede "resumo
   sucinto e próximos passos" quando a resposta é longa. Decisões de produto
   já aprovadas estão na seção "📌 Decisões tomadas" do backlog — ele
   escreveu "não rediscutir".
2. **Como verificar de ponta a ponta sem banco de produção**: o container tem
   PostgreSQL 16 server em `/usr/lib/postgresql/16/bin`. Receita que
   funcionou: criar usuário postgres, `initdb` em `/home/postgres/pgdata`
   (diretórios do scratchpad falham por permissão), subir na porta 5433 com
   socket em /tmp, e rodar scripts ts-node com
   `TS_NODE_PROJECT=tsconfig.scripts.json npx ts-node -r tsconfig-paths/register`
   + `NODE_PATH=/home/user/FOOCCI/node_modules` (scripts fora do repo não
   resolvem módulos sem isso) + `DATABASE_URL` local. Os 3 conjuntos de
   verificação desta frente (23 + 22 + 14 checks) viviam no scratchpad da
   sessão e NÃO sobrevivem — o padrão está descrito aqui para recriar.
3. **Semântica fina do dispositivo** (fonte: código, mas fácil de errar):
   a trava segura o PREÇO, nunca o CUSTO — num salto de +81% do insumo, o
   custo do produto atualiza (CMV real fica visível) e só o preço espera
   aprovação. `ON_TARGET` tem tolerância de 2% (`classifyPrice`) para não
   pipocar sugestão por centavos. Sugestão em massa ("Aplicar sugeridos")
   inclui só itens ABAIXO do ideal; item ACIMA tem botão individual — baixar
   preço em massa foi considerado perigoso.
4. **Estados possíveis do custo de um produto**: (a) manual (digitado na aba
   Preços); (b) pela ficha (calculado, trava o manual); (c) nulo ("Sem
   custo", nunca gera sugestão). A transição (b)→(a) só acontece quebrando a
   ficha. O log de auditoria distingue: `COST_EDIT` = manual, `RECIPE` = ficha.
5. **O parser de ingredientes** (`IngredientParser`) divide por vírgula,
   ponto-e-vírgula, quebra de linha, barra E pelas conjunções " e "/" com " —
   "Hot roll com geleia" vira DOIS insumos. Para o piloto isso acertou; para
   nomes compostos com "com" no meio pode dividir demais. Se um restaurante
   reclamar de insumo picado, o ajuste é na `CONJUNCTION_REGEX`.
6. **Por que `updateCostsWithReprice` ganhou o parâmetro `costSource`**: a
   propagação da ficha reusa TODO o pipeline de custo manual (auditoria +
   AUTO + trava) mudando só o rótulo do log. Se criar um 3º caminho de custo
   (ex.: importação de planilha corrigida), passe por essa função — não
   escreva `menuItem.update({ cost })` direto, ou perde auditoria e automação.
7. **Segredos**: nenhuma chave/API key foi colada nesta conversa (só NOMES de
   variáveis de ambiente e uma string de banco local descartável da sessão).
   Nada a trocar por vazamento desta sessão.
8. **Artifact de proposta**: a proposta visual aprovada pelo dono (mockup da
   página, backlog e cronograma de 19/07) foi entregue como arquivo HTML no
   chat da sessão, não está no repositório — o conteúdo de decisão relevante
   foi transcrito para o backlog e para este handoff.

---

## 7. Adendo de última hora (20/07, durante o push deste documento)

Enquanto este handoff era commitado, a linha remota recebeu commits de outra
sessão que **evoluíram esta mesma frente**: linhas da ficha ganharam unidade
própria (`RecipeLine.unit` + conversão em `src/services/menu/units.ts`,
`lineCost`), surgiu adição de insumos em massa (`bulkIngredientsSchema`) e a
Sidebar teve ajuste visual. As seções acima descrevem o estado até o commit
`314a2321`; para o delta posterior, leia `git log 314a2321..` e os arquivos
citados. As decisões, os porquês e as armadilhas continuam valendo.

*Escrito por Claude (sessão de 19–20/07/2026) antes do encerramento. Commitado
na branch `claude/remove-legacy-runner-q8iXa` — confira o hash no `git log`.*
