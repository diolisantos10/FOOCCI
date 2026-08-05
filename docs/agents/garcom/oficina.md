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

---

2026-08-05 (2ª parte) — **"Preciso confirmar" era o piso, não o teto.** O CEO leu
o conserto e decidiu: *"O rodízio não deve aparecer no cardápio delivery, mas tem
que ter a mesma informação que o agente de WhatsApp tem. Então: existe o rodízio,
e passar o preço, como funciona e tudo mais — mas é só pessoalmente."*

Mandar o cliente falar com humano uma pergunta que o sistema responde é
atendimento pior, não melhor.

**O que existe na base de conhecimento do sushi-cazza: NÃO CONSEGUI VERIFICAR.**
`GET /api/knowledge` em produção devolve **401** — a rota exige sessão
(`getTenantContext`) e não há caminho de leitura por token. Não existe outra rota
que exponha `RestaurantKnowledgeItem`. Registro isto como fato, não como
suposição: **eu não sei se o lojista cadastrou o Q&A do rodízio.** Por isso o
desenho **não depende** de haver item lá.

**De onde a resposta sai, então: do CADASTRO.** `RODIZIO PRESENCIAL`, R$ 99,00,
`showInDineIn=true`, `showInDelivery=false` — dado que eu consigo ler e provar, e
que **envelhece sozinho**: mudou o preço no painel, mudou a fala do Garçom. O Q&A
do lojista entra **por cima**, quando existe, e só ele pode dizer "como funciona"
— isso é informação do restaurante, não minha (guardrail 1).

**A regra que ficou, e ela não fala de rodízio:** *item que o restaurante vende só
no salão existe para ser **contado**, nunca para ser **vendido** no delivery.*
O critério é o cadastro (`showInDineIn && !showInDelivery`), nunca o nome do
prato — vale para couvert, buffet, self-service, chopp na torneira. Sem
`if (slug === "sushi-cazza")` em lugar nenhum.

**A assimetria que era a tarefa de verdade.** `WhatsAppReceptionistService.ts:1337`
lia `RestaurantKnowledgeItem` (ACTIVE, take 10) para o contexto do GPT; o Garçom
do cardápio não lia nada. A régua de casamento vivia dentro de
`RestaurantKnowledgeService`, que importa `prisma` — e o Garçom é puro, então
ficava de fora **por construção**. Extraí a régua para
`src/services/knowledge/knowledgeMatch.ts` (pura, um dono, dois consumidores).
Agora o Q&A do lojista chega ao cardápio por dois caminhos: match determinístico
(quando a busca no cardápio voltou vazia) e bloco `RESPOSTAS OFICIAIS DO
RESTAURANTE` no prompt da IA. Isso vale muito além do rodízio: toda pergunta que
o lojista respondeu na base sumia no cardápio.

**Um achado dentro do achado: o plural matava o Q&A.** `tokenize` casava token
exato — "rodízios" (o que a Júlia digitou) não casava com "rodízio" (o que o
lojista cadastra). O Q&A existia e não era encontrado: silêncio parecendo
sucesso, de novo. Dobra de plural simples (≥4 letras, sufixo "s"), aplicada dos
**dois lados** para a régua seguir simétrica. Isso melhora o WhatsApp junto —
mesma função, mesmo dono.

**O risco NOVO, tratado como tal.** O Garçom passou a falar de um produto que ele
não pode vender neste canal. Quatro camadas, todas em código:

| Camada | Onde |
|---|---|
| item de salão nunca entra no `catalog` | consulta separada em `AIOrderService.loadDineInOnlyItems` |
| resposta de salão sai com `cards: []` | `WaiterBrainV2` — card é o único caminho para o carrinho |
| id fora do catálogo é derrubado | `validateWaiterResponse` regra 2 (já existia) |
| **o pedido não se cria** | `finalize/route.ts` e `AITools.add_item` passaram a exigir `showInDelivery: true` |

A última era um buraco real: `finalize` validava `isActive`+`isAvailable` e **não
olhava o canal**. Nenhum pedido legítimo se perde — a loja só renderiza
`showInDelivery: true` (`page.tsx:336`), então o filtro é o espelho do que o
cliente vê.

**Um detalhe de precedência que custou um teste.** "quero um rodízio pra entrega"
faz `searchMenuByQuery` devolver **Yakisoba com confiança `high`** — a pendência
do matcher difuso, viva. Por isso o item de salão casado pelo **termo curado**
(regex escrita à mão contra texto do cadastro) vence a busca difusa; o casado só
pelo nome respeita a busca, como qualquer outro caminho. Sinal curado ganha de
sinal aproximado.

**Como ficou, com o catálogo real de produção (124 itens) + o item de salão:**

```
cliente: "Vocês tem rodízios"
garçom : Temos sim! RODIZIO PRESENCIAL sai a R$ 99,00 e é só no salão — não vai para entrega.
         Rodízio todos os dias das 18h às 23h, no salão. Crianças até 5 anos não pagam.   ← só com Q&A cadastrado
         (sem Q&A: "Quer falar com a equipe para os detalhes?")
cards=0  botões=[💬 Falar com o restaurante | Ver cardápio]

cliente: "quero 2 rodízios"        → mesma resposta, cards=0, nada de carrinho
cliente: "adiciona aí"             → "Qual deles você quer?" — não inventa item
cliente: "tem estacionamento?"     → "preciso confirmar" (o piso, intacto)
cliente: "tem temaki?"             → 17 cards (intacto)
```

**Verificação:** `npx tsc --noEmit` limpo · `npx vitest run` **435 arquivos /
5618 testes verdes**. Os 17 testes da 1ª parte **não mudaram de expectativa** —
nada foi afrouxado. 18 testes novos em
`WaiterBrainV2.salao-conta-nao-vende.test.ts`, 8 em `knowledgeMatch.test.ts`, 3
em `finalize/route.test.ts`. Simuladores idênticos à 1ª parte: golden set 37/37
score 100 e 28/37 score 76; conversas ok 13 · aviso 9 · falha 2 · P0 0 · P1 2 ·
P2 9 (os catálogos sintéticos não têm item de salão, então a neutralidade é o
resultado esperado — a prova do comportamento novo é o roteiro acima com o
catálogo real).

**Uma coisa que consertei fora do meu domínio, e por quê.** `runRequest.test.ts`
estourava os 5 s padrão do vitest **só na suíte cheia**, por disputa de CPU — 3,6 s
isolado. É o mesmo remédio que `noSideEffects.test.ts` recebeu de dois
especialistas hoje (prazo de 60 s, nenhuma asserção afrouxada). Portão que
reprova por carga ensina a rodar de novo até passar, e aí deixou de ser portão.

**Pendências que NÃO toquei:** as 4 negações do caminho WhatsApp listadas na
entrada anterior seguem abertas; a base de conhecimento do sushi-cazza segue não
verificada (precisa de sessão do lojista).

**Proposta de vitrine** (quem promove é o Diretor): *"Existe é diferente de
vendível — e o cadastro sabe a diferença."* O recorte de canal (`showInDelivery`)
governa o que pode ir ao carrinho; **não** governa o que o agente pode contar. Um
agente que trata os dois como a mesma coisa ou nega o que a casa vende (o P0 da
Júlia), ou vende o que a casa não entrega (o risco inverso). As duas listas têm
que ser separadas na origem, e a que pode virar pedido tem que ser validada
**no servidor**, no momento de criar o pedido — não na tela.

— especialista garcom, a partir de `8e4ba0cf` (branch padrão, já com a 1ª parte)
