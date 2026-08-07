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

---

2026-08-06 — **A frase repetida da vitrine não era mensagem duplicada: era
laço.** Print do CEO na `foocci-bakery` (05/08, 23:49) com dois balões idênticos:
*"Pra fechar o pedido preciso do seu WhatsApp…"*.

**Reproduzido antes de consertar.** Bancada em Chromium com o `PedidoClient`
**real** (esbuild + playwright-core; nada do componente mockado, só as respostas
HTTP, com o payload literal da rota). Cenário do print: vitrine, loja fechada,
carrinho com 1 item, cliente reconhecido como "Diego". Resultado: **3 voltas, 3
balões idênticos** — e não tem fim.

**As quatro hipóteses do CEO, todas conferidas e todas descartadas:**

| Hipótese | Veredito | Evidência |
|---|---|---|
| duplo disparo / dois `useEffect` / StrictMode | não | a frase sai de dentro de um `onClick`, nunca de efeito |
| re-render reemitindo | não | `pushAssistantMessage` é imperativo, não derivado de render |
| retry sem idempotência | não | esse ramo não faz chamada de rede |
| dois caminhos para a mesma frase (a favorita) | **não** | a frase existe em **1** lugar no repositório inteiro: `PedidoClient.tsx:4318` |

**Causa (uma frase):** o portão que pede o WhatsApp **não lê o WhatsApp que a
pessoa acabou de dar** — `POST /api/qr/[slug]/identify` nunca devolve
`customerId` (decisão de segurança escrita na própria rota, `route.ts:15-18`) e o
telefone vinha de `storedCustomer`, um inicializador de `useState` que lê o
`sessionStorage` **uma vez, no mount**, antes de a tela de identificação gravar
lá — então as duas metades da condição `!effectiveCustomerPhone &&
!resolvedCustomerId` ficam verdadeiras para sempre naquela carga da página.

**O segundo dano, pior que o balão, provado na mesma bancada:** em loja de
cliente (identificação obrigatória, onde o portão nem dispara) o mesmo dado
faltando fazia o `POST /finalize` sair com `customerPhone: undefined` para quem
digitou o telefone na entrada e fechou o pedido sem recarregar a página. Depois
do conserto, `"11987654321"`. Pela mesma raiz também estavam mortos, para esse
cliente: carrinho abandonado (`OrderDraft`), "Pedir novamente" e o `customerPhone`
que o Garçom recebe a cada turno.

**Conserto na causa, não no sintoma.** Nenhuma deduplicação de balão foi
adicionada — filtrar a repetição na tela deixaria o laço vivo e mudo. O que
mudou: `PhoneEntryCard` devolve `ClienteIdentificado` com `phone` **obrigatório**
(trava de compilador, não comentário), `handlePhoneIdentified` grava o número em
estado, e a regra saiu do componente para `src/lib/identidadeCheckout.ts` para
ser testável no runner do repo (`environment: node`, sem DOM).

**Achado colateral que também consertei, mesma doença:** `handleResetIdentity`
("Trocar") limpava o `sessionStorage` mas não a cópia em memória — a pessoa
seguia identificada com o número que pediu para trocar.

**Cuidado que quase virou outro bug:** ligar o telefone faria o efeito de
auto-identify (`PedidoClient.tsx:2941`) chamar `/identify` de novo, e cada chamada
grava um `MenuEvent` de visita — toda entrada web passaria a contar **em dobro**
no KPI. Cortado com um `if (sessionCustomerPhone) return;`.

**O `LojaClient` já fazia certo** (`if (identity.phone) setPhone(identity.phone)`,
linha 281): o padrão era conhecido, só não tinha sido aplicado no chat.

**Portões:** `npx tsc --noEmit` limpo · `npx vitest run` 440 arquivos / 5671
testes, `success: true` conferido **no JSON**, não na última linha.

**Não toquei** (território de outros agentes nesta rodada): verdade/ficha do
restaurante e o estado aberto/fechado, `WelcomeModal.tsx`, `page.tsx`,
`identificacao-loja.ts`, `marketing/**`, `site/**`.

**Duas coisas que vi e deixei anotadas em vez de mexer:**
1. Com a loja **fechada** (o caso do print), o botão "Finalizar pedido" abre o
   checkout normalmente — o `handleFinalizeClick` só barra pausa manual
   (`isOrderingPaused`), nunca horário. É do agente que está no aberto/fechado.
2. A tela de revisão diz *"Identifique-se para ver e usar seus cupons"* para
   quem acabou de se identificar, porque o bloco depende de `customerId` — que a
   rota, por segurança, não devolve mais. É decisão de produto (prova de posse do
   telefone), não conserto de tela.

**Proposta de vitrine** (quem promove é o Diretor): *"Mensagem repetida quase
nunca é mensagem duplicada — é pergunta que não escutou a resposta."* Antes de
caçar duplo disparo, conte de quantos lugares a frase pode sair: se sair de um
só, o problema não é emissão, é a **condição que continua verdadeira**. E o
corolário que custou caro aqui: **dado lido do `sessionStorage` num inicializador
de `useState` é uma fotografia do mount** — quem grava lá depois não existe para
o resto da página. Toda identidade obtida durante a sessão tem que virar estado
na hora, senão o app fica perguntando o que já sabe e fechando pedido sem contato.

— especialista garcom, a partir de `13495d82` (branch padrão)

---

2026-08-07 — **Auditoria da `foocci-bakery`: a embalagem ficou pronta, a conversa
não.** Pedido do CEO: *"a Bakery tem que dar um show de atendimento… dá uma
verificada em como está a inteligência e como está saindo o agente."* Só leitura:
nenhum degrau mexido, nenhuma mensagem enviada, cardápio e cadastro intactos.

**Bancada.** Não há `DATABASE_URL` de produção nem `OPENAI_API_KEY` nesta caixa
(o `.env` local é gabarito: banco em `localhost`, `ADMIN_SECRET =
"local-dev-admin-1234"`, chave `"sk-..."`). Então: catálogo montado de
`foocci-bakery.data.ts` e **conferido item a item contra o payload público de
produção** (`GET /api/pedido/foocci-bakery`, commit `f12cb237`) — **40/40 itens,
nome e preço idênticos, zero divergência**. Em cima disso, `decide()` do
`WaiterBrainV2` com `upsellCategories = BAKERY_UPSELL_CATEGORIES`, exatamente o
que a rota passa em produção. 78 perguntas rodadas.

**O que NÃO consegui medir, e digo como fato:**
1. O valor gravado de `BrainFreeFormConfig` da bakery — a única leitura é
   `GET /api/admin/brain/free-form` e ela exige `ADMIN_SECRET` (`route.ts:27-34`).
2. Se a bakery tem linha em `AutoSimulatorConfig` (o robô noturno só roda para
   quem tem — `AutoSimulatorScheduler.ts:35`).
3. A redação dos 15% de turnos que caem na IA (sem chave da OpenAI).

**Achado estrutural que muda a pergunta do CEO.** `BrainFreeFormConfig` é lido em
**um** lugar em runtime: `WhatsAppBrainRuntimeService`. A conversa da LOJA
(`/pedido/[slug]` → `AIOrderService.runWebTurn` → `WaiterBrainV2`) **não passa por
lá em ponto nenhum**. Promover a escada não muda uma vírgula do que o visitante da
vitrine lê. São dois agentes distintos na mesma casa.

**Os cinco defeitos, todos reproduzidos:**

1. **🔴 SEGURANÇA — "sem glúten" numa PADARIA devolve 10 itens de trigo.**
   `selectRestrictionCandidates` (`WaiterBrainV2.ts:2756-2776`) monta a lista com
   `excludeTermsFor(kind)`, e para `allergy` isso é `[]` (`:2752`, comentário:
   *"can't infer the allergen safely"*). O `hayOf` (`:2763`) lê
   `name + description + categoryName` — **nunca `alergenosDetalhados`**, que está
   no `V2CatalogItem` (`:74`), é carregado pela rota (`route.ts:285`) e está
   preenchido nos **40/40** itens da bakery. A função tem o dado na mão e não olha.
   Resultado literal: Coxinha (*"Batata, farinha de trigo…"*), Empada, Esfiha,
   Pão de Batata, Enroladinho, Quiche, Croque-Monsieur, **Pão Francês**, Pão de
   Fermentação Natural, Brioche. `classifyDietarySafety` — a correção da vitrine
   de 02/08 — existe em `ConversationGuardrails.ts:95` e **este caminho não a
   chama**. Dois donos da mesma regra; o determinístico é o que responde.
   **E o portão carimba:** o caso `re-02` do golden set
   (`waiterScenarios.ts:322-332`) checa `no_forbidden_denial` + `has_real_cards` +
   `no_hallucination`. Nenhum checa se o card é seguro. Passou verde com os 10
   itens de trigo. `validateWaiterResponse` tem 10 regras (`:3713-3779`) e nenhuma
   é dietética.

2. **🔴 O plural nega produto que a loja vende.** `searchMenuByQuery` casa por
   `nameNorm.includes(word)` (`WaiterBrainV2.ts:1187-1189`) e `normalizeSearch`
   (`:997`) **não dobra plural**. "bolo" contém-se em "Bolo de Fubá"; "bolos" não.
   Medido em 11 pares singular/plural: **7 viram negação**. `tem bolos?`,
   `tem tortas?`, `tem sucos?`, `tem sobremesas?`, `tem sanduíches?`,
   `tem geleias?`, `tem brownies?` → *"Não encontrei X no nosso cardápio"* — todos
   existem. `tem salgados?` e `tem cestas?` escapam só porque a **categoria** está
   cadastrada no plural. É o mesmo defeito da vitrine ("O plural mata o
   casamento"), consertado em `knowledgeMatch.ts:45` e **não** aplicado ao matcher
   do cardápio: dois matchers, um com o remédio.

3. **🟠 O repertório é curto e não fala da padaria.** `PRESENTATION_OPENERS`
   (`WaiterBrainV2.ts:2544-2554`) tem 9 frases; `presentationOpener` escolhe por
   `seedIndex(selectedProducts.join(","))` (`:2564-2566`) — **determinístico na
   lista de cards**. Logo: mesmo conjunto de produtos ⇒ mesma frase, sempre.
   Em 40 perguntas: 34 determinísticas, **15 frases distintas**, a campeã 8×.
   Quatro perguntas diferentes ("o que vocês têm?", "qual você recomenda?", "me
   indica alguma coisa", "o que tem de mais vendido?") devolvem resposta
   **idêntica byte a byte**. **0 de 34 citam qualquer produto ou categoria pelo
   nome; 34 de 34 terminam em 👇.** O `ACK_POOL` (`:2043-2072`) tem 4 frases no
   balde `first`, três delas "Boa/Ótima + escolha/pedida", iguais para pão
   francês, brownie e café — e uma delas é **"Ótima pedida 🍱"**, bento box numa
   padaria. O rodízio anti-repetição (`lastAckMessages`, `:2098`) funciona: o
   problema é o repertório, não o sorteio.

4. **🟠 A alma da bakery está cadastrada e o Garçom não lê.** `storytellingIA`
   ("o levain da casa chama Aurora, tem sete anos") e `harmonizacaoSugerida` estão
   nos 40 itens, chegam ao `V2CatalogItem` — e só aparecem dentro de uma
   `aiDirective` (`:1949-1951`), isto é, **só nos 15% de turnos que vão à IA**.
   "por que o pão de vocês é diferente?" devolve *"Dei uma garimpada e separei
   essas 👇"*.

5. **🟡 Pergunta de preço não recebe preço, e o matcher difuso continua.**
   "quanto custa o pão francês?" → *"Dei uma garimpada e separei essas 👇"* + 12
   cards. "o pão de queijo tem lactose?" → 12 cards, sem responder (o cadastro diz
   `lactose, ovo`). E `MENU_SYNONYM_GROUPS` (`:1083-1084`) manda "lasanha" casar
   com qualquer texto contendo "massa": **"tem lasanha?" → Brioche, Croissant,
   Pastel de Nata, Coxinha**, com *"Essas aqui são bem pedidas 👇"* — nunca diz
   que não tem. "vocês têm pizza?" acerta e nega; a inconsistência é do sinônimo.

**O que está BOM e não deve ser tocado:** o fechamento configurado funciona
(Café & Bebidas → Confeitaria → concluir, o conserto de 04/08 vivo em produção);
a trava de negação de oferta responde certo em horário, pagamento, entrega por
região e estacionamento (*"preciso confirmar"* + botão), sem inventar.

**Simuladores oficiais contra o catálogo real da bakery:** golden set **34/37,
score 92** — as 3 falhas são `ac-01/02/03`, que procuram categoria "Porções" e
"Sobremesa" e devolvem *"cannot verify"* numa padaria (taxonomia de sushi/pizza,
não defeito). `runWaiterSimulation` (24 cenários, seed `bakery-20260807`): ok 15 ·
aviso 7 · falha 2 · P0 0 — **mas esse simulador usa catálogo sintético próprio, não
o da bakery**, então o número não fala da vitrine. Os dois portões dizem "verde"
sobre a loja que entrega 10 itens de trigo a um celíaco: é o ponto cego já
anotado nesta oficina, agora com caso concreto.

**Nada foi alterado.** Scripts de reprodução ficaram fora do repositório; a
modificação em `src/components/marketing/SinaisDeVenda.tsx` na árvore é de outro
especialista, não minha.

**Proposta de vitrine** (quem promove é o Diretor): *"Detector que só confere se o
card EXISTE não é portão de segurança alimentar."* O golden set carimbou de verde
uma resposta que ofereceu Pão Francês a quem pediu "sem glúten", porque suas três
checagens perguntavam se o id era real, se não havia negação proibida e se não
houve alucinação — três perguntas legítimas, nenhuma sobre o risco. **Um portão só
cobre o dano que ele sabe nomear**; e quando o dano é físico, a checagem tem que
ser sobre o ATRIBUTO do item, não sobre a integridade da lista. O corolário caro:
`classifyDietarySafety` foi consertado em fevereiro do domínio e **nunca foi
chamado** pelo seletor determinístico — regra com dois donos protege só o caminho
de quem lembrou dela.

— especialista garcom, a partir de `f12cb237` (branch padrão, no ar em produção)

---

2026-08-07 (2ª parte) — **Os três consertos autorizados: dietético, plural e
repertório.** Executados na ordem pedida, cada um com portão nas duas metades e
sabotagem conferida NO ARQUIVO antes de julgar o resultado.

**① 🔴 O dietético — e um segundo defeito que só apareceu rodando.**

O conserto planejado era `selectRestrictionCandidates` chamar
`classifyDietarySafety` e ler `alergenosDetalhados`. Feito
(`WaiterBrainV2.ts:2830-2870`), com uma distinção que precisa ficar registrada:
**alérgeno exige prova, preferência não.** `allergy` (glúten, lactose, "alérgico
a X") só oferece item cujo cadastro prova estar limpo — `unknown` fica de fora.
Vegano/vegetariano/sem peixe/sem porco continuam pela heurística de nome, porque
o campo de alérgeno não sabe responder se algo é vegano, e exigir declaração ali
esvaziaria a resposta em todo restaurante que não preenche o campo (guardrail 5).

**Rodei antes de acreditar, e ainda estava errado.** Depois do conserto, "sem
glúten" na padaria devolvia Baguete Rústica, Caracol de Canela, Torta Holandesa
— todos com `alergenosDetalhados: "glúten"`. Causa: `DIETARY_BLOCK_MAP["sem
glúten"]` listava `trigo · farinha · pão · massa · pizza · macarrão` e **não
listava "glúten"**. O campo onde o lojista declara é preenchido com o NOME do
alérgeno, e o vocabulário do filtro não continha esse nome. O dado era lido e
mesmo assim não casava. Corrigido no mapa (glúten/gluten/cevada/centeio; lactose
em "sem lactose" e em vegano/vegana).

**A régua mudou de casa, e isso não é arrumação.** A suíte
`WaiterBrainV2.cards-and-restrictions.test.ts` **mocka `ConversationGuardrails`
inteiro** para escapar do import de `prisma` — e o mock exporta duas funções. Meu
import novo virou `undefined`, o handler estourou, e o `decide()` devolveu
`SAFE_FALLBACK`. Dois testes ficaram vermelhos e me mostraram o problema real:
regra de segurança atrás de um import de banco é regra que some em silêncio no
mock. Extraí para `src/services/ai/waiter/dietarySafety.ts` (puro),
`ConversationGuardrails` reexporta, nenhum consumidor mudou de import. É
literalmente o mesmo remédio de `knowledgeMatch.ts`, aplicado à segunda régua que
tinha o mesmo problema.

**O portão que existia era carimbo.** `re-02` checava `no_forbidden_denial` +
`has_real_cards` + `no_hallucination` e passou VERDE com os 10 itens de trigo.
Nasceram `dietary_cards_safe` e `dietary_cards_unfiltered`
(`waiterEvaluator.ts`), que leem o **cadastro** (`alergenosDetalhados`) do
catálogo recebido — nunca lista de nomes, que envelhece com o cardápio — e três
casos novos: `re-03` (glúten), `re-04` (lactose) e `re-05` (**sem restrição
declarada → o cardápio continua inteiro**). Sabotagem: `re-03`/`re-04` vermelhos
com a evidência item a item, `re-05` verde. Sabotagem inversa (filtro vazando
para todo mundo): `re-05` vermelho, os outros verdes.

**A resposta que o Diretor pediu: o defeito era GERAL, não da bakery.**
`selectRestrictionCandidates` é código compartilhado — 100% dos restaurantes
respondiam pergunta de alergia com lista não filtrada. O que muda por
restaurante é o que a correção tem para ler:

| | `alergenosDetalhados` preenchido | resposta nova |
|---|---|---|
| `foocci-bakery` | **40/40** | 11 cards, filtrados pelo alérgeno pedido |
| `sushi-cazza` (cliente real) | **0/112** (`data/cardapio-sushi-cazza.csv`) | escalada: *"o cardápio não me dá como confirmar item por item"* + botão do WhatsApp |

Conferido contra o catálogo de produção do sushi-cazza (125 itens): vegano, sem
peixe e as buscas normais **não mudaram** — só o caminho de alérgeno.

**② O plural.** Duas causas, não uma. A busca casa por SUBSTRING
(`nameNorm.includes(word)`), e "bolos" não cabe em "Bolo de Fubá" — resolvido com
`queryForms`, que testa a forma original **e** a singular, com freio de tamanho
(≥4 letras) porque "chás"→"cha" acharia "Chapa". Mas `MENU_SYNONYM_GROUPS` e
`CATEGORY_PROXIMITY_MAP` casam por PALAVRA INTEIRA (`\bsobremesa\b`), e o "s"
quebra a fronteira: `foldQueryPlurals` + `matchesQueryPattern` cobrem esse
segundo caso. A função de dobra é a **mesma** de `knowledgeMatch` (exportada, não
recriada). Resultado: 7 de 7 negações falsas viraram resposta; "vocês têm pizza?"
continua negando.

**③ O repertório.** Três frentes. (a) A abertura nomeia o assunto quando existe
um — item único, ou categoria quando todos os cards são dela; moldes em aposição
("{x} — separei tudo o que temos 👇") para funcionar com qualquer rótulo, sem
concordância para errar. (b) O seed passou a incluir a PERGUNTA, não só a lista
de cards. (c) `ACK_POOL` de 4 para 7 frases no balde `first`, quatro delas
nomeando o item — e o **🍱 saiu da padaria**.

**A alma cadastrada.** `storytellingIA`/`perfilPaladar` entram quando a resposta
é de UM item só. "Torta Holandesa: cremoso, doce, baunilha, chocolate. / É este
aqui 👇". Só 10 dos 40 itens da bakery têm `storytellingIA`; os 40 têm
`perfilPaladar`, e é ele que carrega o peso.

**A regra 4 do validador quase matou o conserto em silêncio.** Ela apaga do texto
o nome de qualquer produto que não esteja nos cards — e `ON_ITEM_ADDED` não pode
ter cards (regra 7). "Pão Francês anotado 👌" saía como "anotado 👌". Passei ao
validador uma lista de **nomeáveis** (carrinho + item recém-adicionado): o
produto que a pessoa acabou de escolher é nomeável por definição. A trava contra
citar o que não está à mostra continua valendo para todo o resto, com teste.

**Números na bakery, antes → depois** (40 perguntas, mesmo roteiro):

| | antes | depois |
|---|---|---|
| frases distintas (34 respostas determinísticas) | 15 | **23** |
| a campeã aparece | 8× | **4×** |
| respostas idênticas byte a byte | 2 grupos / 6 perguntas | **1 grupo / 2 perguntas** |
| citam produto ou categoria pelo nome | **0/34** | **8/34** |
| plurais que negavam produto existente | 7/11 | **0/11** |
| cards com glúten para quem pediu "sem glúten" | **10 de 12** | **0 de 11** |
| golden set (catálogo real da bakery) | 34/37 · score 92 | **37/40 · score 93** |

As 3 falhas restantes do golden set são `ac-01/02/03`, que procuram categoria
"Porções"/"Sobremesa" e devolvem "cannot verify" numa padaria — taxonomia de
sushi, não defeito.

**Achado que NÃO consertei, e por quê.** `decide()` embrulha tudo num `try/catch`
e devolve `SAFE_FALLBACK` = *"Perfeito 😊 fico por aqui se precisar de ajuda."*
Uma exceção no Garçom **parece ao cliente uma despedida educada** e a qualquer
painel um turno normal (o `console.error` existe, mas ninguém olha o console por
turno). Foi assim que eu descobri o problema do mock: o teste me devolveu "tchau"
onde deveria haver um TypeError. É o "silêncio parece sucesso" na forma mais
cara. Não mexi porque mudar comportamento de queda precisa de decisão — a
substituição não pode ser mais destrutiva que a queda (guardrail 5).

**Também não toquei** (fora das três frentes autorizadas): preço que não vira
resposta em texto, e `MENU_SYNONYM_GROUPS:1083` fazendo "lasanha" casar com
qualquer "massa" (na bakery: Brioche, Croissant, Pastel de Nata).

**Portões:** `npx tsc --noEmit` limpo · `npx vitest run` **2110 arquivos / 5965
testes, `success: true` lido no JSON**, 0 falhas. 48 testes novos, dos quais
**23 existem só para provar que o legítimo continua passando**. Cada portão novo
foi conferido com sabotagem — e em cada caso a sabotagem foi confirmada por
`grep` no arquivo ANTES de o resultado ser julgado.

**Proposta de vitrine** (quem promove é o Diretor): *"Detector que só confere se
o card EXISTE não é portão de segurança alimentar"* — e o corolário que apareceu
executando: **regra de segurança atrás de um import de banco é regra que some no
mock.** O golden set carimbou de verde uma resposta que ofereceu Pão Francês a um
celíaco porque suas três checagens perguntavam se o id era real, se não havia
negação proibida e se não houve alucinação: três perguntas legítimas, nenhuma
sobre o risco. Um portão só cobre o dano que ele sabe nomear, e quando o dano é
físico a checagem tem que ser sobre o ATRIBUTO do item, lido do cadastro — nunca
sobre a integridade da lista, nunca contra nomes escritos à mão. E a régua que
protege tem que ser **pura**: `classifyDietarySafety` estava correta desde 02/08 e
mesmo assim não protegia ninguém no cardápio, porque morava atrás de `prisma` e
o Garçom não conseguia (nem os testes dele) alcançá-la de verdade.

— especialista garcom, a partir de `f12cb237` (branch padrão)
