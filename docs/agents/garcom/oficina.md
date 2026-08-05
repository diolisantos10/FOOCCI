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

---

2026-08-05 — **P0 Sushi Cazza: o Garçom negou o rodízio que o restaurante
vende.** 14:57 e 14:58, cardápio, cliente Júlia. "Vocês tem rodízios" →
*"Não encontrei rodízios no nosso cardápio. Posso ajudar com outra coisa? 😊"*.
Ela insistiu ("Vcs tem rodízio"), levou a mesma frase e foi embora.

**O fato, antes do conserto.** O Sushi Cazza **tem rodízio**. `RODIZIO
PRESENCIAL`, R$ 99/pessoa, `isActive=true`, `isAvailable=true`,
`showInDelivery=false`, `showInDineIn=true` (`data/cardapio-sushi-cazza.csv`
linha 2, `data/sushi-cazza-import.json`). Confirmado **na produção**, leitura
apenas: `GET https://foocci.com.br/api/pedido/sushi-cazza` devolve a categoria
`RODIZIO PRESENCIAL` **com zero itens** — a categoria aparece, o item não, porque
o canal de delivery o esconde.

**Reprodução byte a byte** antes de tocar em qualquer coisa: catálogo montado a
partir do payload de produção (124 itens) + `decide({event:"ON_USER_MESSAGE"})`
devolveu a frase idêntica à do print, para as duas formas que a cliente digitou.
O "s" de "rodízios" vem de `termoPerguntado`, que ecoa a palavra do cliente.

**Causa, arquivo por arquivo.**
1. `src/app/api/pedido/[slug]/route.ts:277` — o catálogo do Garçom é
   `showInDelivery: true`. O rodízio nunca entra na busca.
2. `src/services/ai/WaiterBrainV2.ts:3241` (antes da mudança) — frase montada em
   código: `Não encontrei ${termLabel} no nosso cardápio…`, disparada por
   `resolveMenuIntent().noMatch`. Não é resposta de modelo nem fallback do
   matcher difuso: é `queryTermCount > 0 && ids.length === 0` virando negação.
3. `src/services/ai/AIOrderService.ts:382` (antes) — no caminho da IA, o mesmo
   `noMatch` injetava *"OBRIGATÓRIO: informe ao cliente que não encontrou"*. O
   prompt mandava o modelo negar.

**Detalhe que vale registro: as duas metades do Garçom discordam sobre o
cardápio.** `PromptBuilderService.buildForWeb` (linhas 230-240) monta o CARDÁPIO
COMPLETO do prompt com `menuCategory.isActive` + `items.isActive` — **sem filtro
de canal**. Ou seja: o `RODIZIO PRESENCIAL` está no prompt do modelo e fora do
catálogo determinístico. No caso da Júlia isso não salvou nada, porque a negação
determinística responde antes (`requiresAI=false`) — mas é uma inconsistência
viva entre as duas camadas do mesmo agente.

**Por que o caso de rodízio que já existia estava verde.** Ele existe em
`src/services/brain/Brain.test.ts:44-45` e `BrainReasoner.test.ts:118`, e (a)
cobre **outro agente** — o caminho WhatsApp/Brain, que lê `RestaurantKnowledgeItem`
categoria `RODIZIO_INFO`; o Garçom do cardápio **não lê `RestaurantKnowledgeItem`
em lugar nenhum** (grep: só `WhatsAppReceptionistService` e o Brain consomem); e
(b) testa a verdade **presente** (Q&A existe → chega ao snapshot), nunca a verdade
**ausente** (não há fato → não pode negar). Teste de "achou → responde certo"
não cobre "não achou → cala a boca". `docs/brain-universal-roadmap.md:119` ainda
lista o caso de golden set como `[ ]`.

**A trava, em código (guardrail 4).** Módulo novo
`src/services/ai/waiter/offeringClaims.ts`, puro, com vocabulário **explícito e
curto** de ofertas que o cardápio de delivery não tem como confirmar nem negar
(rodízio/buffet, reserva, consumo no salão, retirada, entrega por região,
pagamento, horário, cardápio infantil, estacionamento, eventos, música ao vivo,
pet, acessibilidade, wi-fi, couvert). Três pontos de aplicação:

- `WaiterBrainV2.handleUserMessage` — antes do guarda de negação por existência,
  responde "preciso confirmar" + escalada (`open_whatsapp:` quando a loja tem
  número). Só dispara se a busca no cardápio **também** voltou vazia: "vocês
  fazem entrega de temaki?" continua mostrando temakis.
- `validateWaiterResponse` regra 10 — **a trava de verdade**: toda saída
  determinística passa por ali, então nenhum handler (nem os que ainda vão
  nascer) consegue devolver negação de oferta sem prova. Substitui **só a frase
  ofensora** e loga com `console.warn` (não `waiterLog`, que é gated por
  `WAITER_DEBUG` — trava que dispara em silêncio ninguém audita).
- `AIOrderService` — mesma sanitização sobre a resposta do modelo, antes dos três
  retornos, mais a instrução invertida no prompt do caso `noMatch`.

Ajuste de linguagem no caminho legítimo: `WaiterBrainV2` linha ~3232 dizia
*"Não temos X no cardápio"* para item ausente; virou *"Não encontrei X"*. O
catálogo prova o que está nele, nunca o que o restaurante deixa de oferecer.

**Medição, não fé.** Golden sets idênticos antes e depois (clássico 37/37 score
100; padaria 28/37 score 76). Simulador de conversas (24 cenários, seed
`upsell-categorias-20260804`) **melhorou**: ok 12→13, aviso 10→9, P2 10→9,
falhas 2→2, P0 0. O cenário que virou: `PAYMENT_QUESTION_23` ("quais as formas
de pagamento?"), que antes caía na IA com resposta vazia — o ponto cego do
simulador — e agora responde "preciso confirmar" deterministicamente. Confirmado
que isso **não** é regressão: `buildForWeb` não carrega `paymentSettings` nem
`businessHours`, então a IA nunca teve esse fato para começar.

**Varredura do padrão — o que achei e NÃO consertei (decisão do CEO):**
1. `WhatsAppOrderStateMachine.ts:199` — negação **fixa no código**, igual para
   todo restaurante: *"Infelizmente não aceitamos vale-refeição/voucher no
   momento 😕 Mas aceitamos Pix, cartão e dinheiro."* Nega e afirma, as duas sem
   ler `paymentSettings`.
2. `WhatsAppOrderStateMachine.ts:385` — *"Não temos bebidas/sobremesas
   disponíveis no momento"* quando o filtro por **palavra no nome do item** não
   casa. É o bug da Confeitaria (já nesta oficina) na voz do WhatsApp.
3. `WhatsAppOrderStateMachine.ts:1003` e `:1048` — *"Não encontrei {assunto} no
   cardápio"* para pergunta de cardápio; oferece atendente (melhor), mas com
   `subject="rodízio"` repete o caso da Júlia no canal WhatsApp.
4. `WhatsAppOrderBrain.ts:74` — prompt manda "diga gentilmente que não temos"
   para o que não estiver no cardápio.
5. `WaiterBrainV2.ts:2989/2995` — "Ainda não temos Instagram/TikTok configurado"
   é honesto (fala da configuração, não do restaurante); deixei.
6. Restrição alimentar (vegetariano/vegano/sem glúten) **já está correta** e não
   entrou no vocabulário novo: `classifyDietarySafety` responde "prefiro não
   cravar". Duplicar criaria dois donos da mesma regra.

**Verificação:** `npx tsc --noEmit` limpo · `npx vitest run` **430 arquivos /
5514 testes verdes** · 17 testes novos em
`src/services/ai/tests/WaiterBrainV2.negacao-de-oferta.test.ts` (9 deles existem
só para provar que o legítimo continua passando).

**Proposta de vitrine** (quem promove é o Diretor): *"O agente pode dizer que não
achou um PRATO; nunca que o restaurante não OFERECE."* Busca vazia é fato sobre
o recorte do catálogo daquele canal, não sobre o restaurante — e o recorte de
delivery esconde por construção tudo que é do salão. A distinção precisa morar
num validador de saída, não numa instrução de prompt: a frase que a Júlia leu
estava escrita em código, e a instrução equivalente no prompt mandava o modelo
fazer o mesmo.

— especialista garcom, a partir de `c1759805` (produção no ar no momento do P0)
