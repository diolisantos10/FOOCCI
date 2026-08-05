# Oficina — garçom (corrente)

> Append-only. O agente escreve aqui; a vitrine é promovida pelo Diretor.

---

2026-08-03 — **sushi-cazza: número reconhecido sem nome + "Comprar novamente"
ausente.** Investigação somente-leitura (despachada pelo Diretor). Causa comum
provável: `findFirst` por `phoneCandidates` **sem `orderBy`** em 4+ pontos
(`pedido/[slug]/page.tsx`, `api/qr/[slug]/identify`, `whatsapp-session`,
`RepeatOrderService.resolveCustomerId`) resolvia cadastro duplicado pré-fix do
9º dígito — a duplicata vazia que o comentário de `src/lib/phone.ts` já
descrevia; o fix dos candidatos simetrizou a busca mas não priorizou o cadastro
rico. Nome-fantasma (`name = telefone`, criado por upserts antigos em
`page.tsx` e `WebhookProcessorService.ts`) e nome vazio (`"".split()[0]` devolve
`""`, não `null`) produzem o sintoma do nome sem quebrar nada visível. Gates do
"Comprar novamente" que permanecem por construção: status do pedido ∈
{CONFIRMED…DELIVERED}, item vivo no cardápio, item com option group obrigatório
é dropado em silêncio (só conta em `unavailableCount`, que ninguém exibe).
Correção aplicada pelo Diretor na mesma sessão: `CUSTOMER_LOOKUP_ORDER` +
`customerFirstName` em `src/lib/phone.ts`, aplicados nos 5 lookups; rotas de
identify agora corrigem cadastro fantasma quando o cliente informa o nome real.

---

2026-08-04 — **Categorias de upsell do fechamento viram configuração do
restaurante.** Pedido do CEO: a padaria de vitrine não tem "sobremesa", tem
**Confeitaria**, e o Garçom não oferecia nada no segundo passo do fechamento.

**Reprodução antes de mexer** (script `scripts/simular-garcom-upsell.ts`,
cardápio de padaria com `Café & Bebidas` + `Confeitaria`):

```
PADARIA-SEM-CFG t1 [INTERVENTION] "Antes de fechar, deixe-me apresentar nossas bebidas."  cards=cafe|capuccino
PADARIA-SEM-CFG t2 [CHECKOUT_SUPPORT] "Excelente pedido. Vamos concluir agora."           cards=
```

**Causa exata.** `handleCheckoutStarted` (`src/services/ai/WaiterBrainV2.ts`)
tinha DOIS passos escritos à mão. O passo 2 dependia de
`isDessertCategory` (`src/services/ai/ConversationGuardrails.ts:30`), cuja lista
é `sobremesa · doce · sorvete · torta · bolo · brownie · pudim · mousse · gelat ·
açaí · milkshake`. **"Confeitaria" não casa com nenhuma.** `selectDessertItems`
devolvia `[]`, o bloco caía direto no `done()` — e ninguém era avisado. É a
forma mais cara do ponto cego já anotado nesta oficina: **o silêncio parecia
sucesso**. Não é bug de padaria: é bug de toda taxonomia que não seja a do
sushi/pizzaria genérico.

**Como ficou.** Módulo novo `src/services/ai/waiter/upsellCategories.ts`:
`resolveUpsellSequence(catalog, configured)` devolve os passos daquele
restaurante. Sem configuração → os dois passos legados, com os MESMOS
classificadores (inclusive a precedência bebida > sobremesa de `analyzeMenuItem`,
que faz "Milk-shake" continuar sendo bebida). O `handleCheckoutStarted` virou um
laço sobre a sequência; o anti-loop deixou de ser o `checkoutUpsellStage` de dois
degraus e passou a ser `WaiterMemory.checkoutUpsellOffered: string[]`.

**Três decisões que valem registro:**

1. **Casamento exato, nunca difuso.** Categoria configurada casa por nome
   normalizado (minúsculas, sem acento, pontuação → espaço) e só. "Bebidas" NÃO
   casa com "Café & Bebidas"; "Confeit" NÃO casa com "Confeitaria". A pendência
   do matcher difuso (lasanha ↔ yakisoba) é exatamente o erro que não se repete
   aqui — no fechamento ele custaria a oferta errada na frente do cliente.
2. **Vazio = "use o padrão", nunca "não ofereça nada".** Vale para a coluna nova
   (`DEFAULT ARRAY[]`), para `loadUpsellCategories` quando o banco falha, e para
   o restaurante sem registro de marca. Guardrail 1: ausência de informação não
   pode virar informação.
3. **Ponte para a memória antiga.** `seedOfferedFromStage` traduz o
   `checkoutUpsellStage` legado em "os N primeiros passos já saíram", e só é
   consultado enquanto `checkoutUpsellOffered` estiver vazio. Sem isso um deploy
   no meio de um pedido reoferecia o que o cliente acabou de ver.

**Prova de não-regressão por medição, não por fé.** O mesmo script rodado com
`git stash` (código anterior) e depois com a mudança devolveu saída **idêntica**:
golden set clássico 37/37 (score 100), golden set padaria 28/37 (score 76 — as
9 falhas `gs-01..05, vc-02, ac-01..03` são cenários escritos para cardápio de
sushi/pizza, iguais antes e depois), simulador 24 cenários `ok=12 warn=10 fail=2
p0=0 p1=2 p2=10`, e as falas do fechamento clássico palavra por palavra.

**Depois da configuração, a padaria:**

```
BAKERY t1 [INTERVENTION] "Antes de fechar, dá uma olhada em Café & Bebidas 👇"        cards=Café Coado, Cappuccino
BAKERY t2 [INTERVENTION] "Temos também Confeitaria para completar seu pedido 👇"      cards=Bolo de Fubá, Torta de Limão
BAKERY t3 [CHECKOUT_SUPPORT] "Excelente pedido. Vamos concluir agora."                cards=(nenhum)
```

**Pontas soltas que NÃO toquei (e por quê):**
- `PedidoClient.tsx:532/544` `findBeverageCat`/`findDessertCat` seguem com
  taxonomia fixa — mas `offeredDrink`/`offeredDessert` **nunca são setados como
  true** no arquivo inteiro, então o efeito que os usa é código morto hoje.
  Mexer ali seria risco sem ganho.
- `handleUserMessage` ainda tem os caminhos `see_final_suggestions` e
  `see_desserts_again` (botões legados) presos ao intent `asks_for_dessert`.
- `AIWebSimulatorService.ts:145` tem a própria cópia de `isDrinkCategory`.
- Ambiente sem banco e sem sessão autenticada: **não capturei os 3 screenshots**
  da tela nova. `next build` e `next lint` passam; a avaliação visual fica para
  o especialista de interface.
- `node_modules` é compartilhado com o repositório-pai por symlink, então
  `prisma generate` escreve lá. O client foi sobrescrito duas vezes no meio do
  trabalho — rode `npx prisma generate` antes de confiar num `tsc` vermelho.

**Verificação:** `npx tsc --noEmit` limpo · `npx vitest run` 397 arquivos /
4994 testes verdes · 39 testes novos em
`src/services/ai/tests/WaiterBrainV2.upsell-categories.test.ts`.

— especialista garcom, a partir de `c707fd85`
