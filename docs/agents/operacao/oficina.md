# Oficina — operação

> Append-only. O especialista escreve; o Diretor promove para a vitrine.

---

## 2026-08-04 · A1 do CR — cancelar não cancelava no MP; webhook ressuscitava a sub

**Contexto:** CR `docs/CR-seguranca-cibernetica-2026-08-03.md`, item A1 (🟠). Base:
branch `claude/foocci-brain-vaamrx` (produção incorporada; último commit da série C1).

**Cadeia do bug confirmada no código (antes):**
- `PlanSubscriptionService.cancel` (`PlanSubscriptionService.ts:122-127`) só fazia
  `update` local → `CANCELADA` + `canceledAt`. **Nunca tocava o preapproval no MP.**
- Rota admin `.../subscriptions/[id]/action/route.ts:67-69` chamava esse `cancel`
  puro-local. O CEO cancela no admin, o MP nunca soube.
- MP cobra o próximo ciclo → webhook chega com pagamento `approved` →
  `mp-webhook/route.ts:64`: `if (sub.status !== "ATIVA") await activate(sub.id)` →
  `activate` (`:111-116`) fazia `update` **limpando `canceledAt`** e pondo `ATIVA`.
  Ressuscitava a sub cancelada, faturava e disparava NFS-e. Loop eterno de cobrança.

**Duas travas, complementares (uma pura, uma depende de token):**

1. **Trava anti-reativação — código puro, sem token (passo 3/4 da ordem).**
   `activate` virou `updateMany({ where:{ id, status:{ notIn:[...TERMINAL_STATUSES] }}})`
   — ATÔMICO, sem janela ler→gravar. `count===0` registra (guardrail 6), não dá
   sucesso silencioso. `TERMINAL_STATUSES=["CANCELADA"]` + `isTerminalStatus()`
   exportados (`PlanSubscriptionService.ts`). Webhook payment branch
   (`mp-webhook/route.ts`) ganhou guarda `isTerminalStatus(sub.status)` ANTES de
   `recordPaidCharge`/`activate`: sub terminal → **não fatura e não reativa**
   (`{ignored:true, reason:"subscription_terminal"}`). Não emitir NFS-e para
   cobrança-zumbi é deliberado — o certo é reembolso no MP, não uma nota. Defesa em
   profundidade: o webhook barra E o `activate` barra.

2. **Cancelamento REAL no MP — depende do `MP_PLATFORM_ACCESS_TOKEN`.**
   Novo `MercadoPagoPlatformBilling.cancelPreapproval(id)`: `PUT /preapproval/{id}`
   `{status:"cancelled"}`. Sem token → `{ok:false, reason:"gateway_nao_configurado"}`
   (não mente que cancelou). Rota admin `cancel` reescrita: se há `mpPreapprovalId`,
   cancela no MP; **sempre** marca terminal local (arma a trava 1 mesmo se o MP
   falhar); se o MP falhou → **502 `{canceledLocally:true, gatewayError}`** — não
   vira sucesso silencioso (guardrail: proteção que não registra bloqueia).

**Por que a ordem "sempre marca local, mesmo se MP falhar":** a trava 1 é o que
impede a cobrança-zumbi de reativar/faturar do nosso lado sem depender de credencial
externa. Abortar o local no erro do MP deixaria a sub `ATIVA` e a trava desarmada —
pior. A trava 2 é o que estanca o dinheiro no cartão; sua falha é reportada, não
engolida.

**Onde pus o MP-cancel (e por que NÃO no service):** `PlanSubscriptionService` não
importa `MercadoPagoPlatformBilling` (evita import circular — o MP importa
`CYCLE_MONTHS` do service). A orquestração ficou na rota admin, que já importava os
dois — mesmo padrão de `mp-link` (`createPreapproval` + `attachMercadoPago`). O
`cancel` do service segue puro-local de propósito: o webhook branch `preapproval
cancelled` (`:46`) usa esse mesmo `cancel` para SINCRONIZAR quando o MP avisa que já
cancelou — ali não se deve re-chamar o MP.

**Verificação:** `npx tsc --noEmit` limpo; `npx vitest run` → 378 arquivos, 4721
testes, verde (+3 arquivos novos, +9 testes). Provas:
- `PlanSubscriptionService.test.ts` — `isTerminalStatus`; `activate` filtra terminal
  no próprio UPDATE (count 0 registra); sub viva reativa.
- `mp-webhook/route.test.ts` — (b) pagamento p/ sub CANCELADA: sem `planInvoice.create`,
  sem `updateMany`, sem `emit`; (c) sub `AGUARDANDO_PAGAMENTO`: fatura e ativa.
- `.../action/route.test.ts` — (a) cancel chama `cancelPreapproval` + grava CANCELADA;
  (a') MP recusa → 502 mas grava terminal; (a'') sem token → 502 avisando o operador +
  grava terminal; (a''') sub sem preapproval → cancela local sem tocar o MP.

**NÃO** foi feito deploy nem merge, conforme ordem.

**Aviso honesto:** o cancelamento no MP (`cancelPreapproval`) foi provado com mock,
não contra a API real do MP nem numa assinatura viva. Trate a chamada externa como
conserto provado no código até haver uma execução real — como a impressão física.

**Proposta de vitrine (promoção é do Diretor):** *"Assinatura tem estado TERMINAL, e
a trava vive no UPDATE, não na leitura."* CANCELADA é terminal; `activate` é
`updateMany` com `notIn TERMINAL_STATUSES` (atômico) — nunca ler-depois-gravar num
estado que troca dinheiro. Cancelar de verdade = cancelar no gateway externo E marcar
terminal local; a marca local é a trava que não depende de credencial e por isso é
armada mesmo quando a chamada externa falha. Falha de gateway se reporta (502), nunca
vira sucesso silencioso. Origem: A1 do CR, este commit.

---

## 2026-08-04 · A2 do CR de segurança + 2 gates estruturais (guardrail 4)

**Contexto:** CR `docs/CR-seguranca-cibernetica-2026-08-03.md`, item A2 e "Travas
estruturais". Base: `93cf477f`.

**TAREFA 1 — apagada a rota-fantasma `src/app/api/admin/delivery-quote/route.ts`.**
Prova de que era código morto, coletada ANTES de apagar:
- `grep admin/delivery-quote` no repo todo → só o próprio arquivo, um log interno
  (`[admin/delivery-quote]`) e menções em docs (o CR e um `.md`). Zero caller.
- Os dois callers reais de "delivery-quote" no front usam as rotas seguras:
  `ManualOrderModal.tsx:437` → `/api/orders/delivery-quote`; `PedidoClient.tsx:4339`
  → `/api/pedido/[slug]/delivery-quote`. Nenhum aponta para `/api/admin/...`.
- O furo: `/api/admin` está em PUBLIC_PATHS (`middleware.ts:56`), o middleware não
  injeta headers de tenant nesse caminho, e o handler confiava em `getTenantContext`
  (headers `x-restaurant-id`/`x-user-role` = input do atacante). Bypass funcional.

**TAREFA 2 — `src/security/routeGuards.test.ts`** (segue o idioma de teste estrutural
já usado em `src/services/quality/noSideEffects.test.ts` e `middleware.publicPaths.test.ts`:
varredura de FS + invariante). Vitest já roda `src/**/*.test.ts` — nenhum wiring de CI
novo.
- Gate (a): extrai os regexes de PUBLIC_PATHS do PRÓPRIO `middleware.ts` (fonte única,
  sem duplicar), mapeia cada `route.ts` para sua URL e falha se uma rota pública usa
  helper de tenant (`getTenantContext`/`getTenantId`/`assertTenant`/`getTenantIdFromRequest`).
- Gate (b): toda rota `src/app/api/admin/**` precisa referenciar `guardAdmin`/
  `checkAdminRequest`, senão falha com o arquivo no nome.
- Ambas as mensagens carregam o arquivo culpado (guardrail 6). Provado que MORDEM:
  arquivos-isca temporários em `admin/` e `pedido/` fizeram os dois gates falharem
  nomeando a isca; removidos.

**O que o gate (b) acusou além da rota apagada (reportado, não silenciado):** três
rotas admin sem os helpers compartilhados, todas com auth PRÓPRIA e legítima — postas
num `ADMIN_GUARD_EXEMPT` com justificativa, não ignoradas:
- `admin/session/route.ts` — login: valida o `ADMIN_SECRET` cru e EMITE o cookie; não
  pode exigir a sessão que cria.
- `admin/reset-owner/route.ts` — recuperação de emergência (early-exit no middleware,
  `middleware.ts:98`); auth inline `x-admin-secret === ADMIN_SECRET`.
- `admin/force-deploy/route.ts` — fallback de deploy; mesma auth inline.
Um 4º teste garante que entrada obsoleta no allowlist (rota removida) também falha o
build — o allowlist não pode autorizar caminho que não existe mais.

**Nota de doutrina para a vitrine (proposta):** `/api/admin/**` está DENTRO de
PUBLIC_PATHS de propósito — a auth de admin é por cookie/secret, não por NextAuth. Logo
uma rota admin sofre AS DUAS invariantes ao mesmo tempo: (a) proibida de usar helper de
tenant e (b) obrigada a chamar guarda de admin. Não são regras concorrentes; uma rota
admin nova nasce sujeita às duas.

**Verificação:** `npx tsc --noEmit` limpo (após limpar um artefato órfão em
`.next/types/app/api/admin/delivery-quote`, gerado e gitignored); `npx vitest run` →
371 arquivos, 4698 testes, verde, incluindo os 4 novos.

**NÃO** foi feito deploy nem merge, conforme instruído.

---

## 2026-08-04 · C1 do CR (P0) — telefone→endereço na loja pública, sem login (LGPD)

**Contexto:** CR `docs/CR-seguranca-cibernetica-2026-08-03.md`, item C1 (🔴, trava o
faturamento). Cadeia: `identify-customer` (telefone→`customerId`+histórico) →
`customer-profile` (`customerId`→e-mail+todos os endereços) → `customer-address`
(cria/edita/apaga). O `customerId` era **credencial ao portador**; como o passo 1 o
entregava a partir do telefone, telefone+slug bastavam para puxar o endereço de casa
da vítima.

**Caminho escolhido — REAPROVEITAR o `waToken` como prova de posse do telefone.**
Já existia `src/lib/wa-token.ts`: HMAC assinado com `NEXTAUTH_SECRET`, carrega
`{phone,name,exp}`, entregue à vítima **pelo WhatsApp** (logo, possuir o token = possuir
o número). É exatamente uma prova de posse. Não inventei OTP nem sessão nova: o cliente
que volta pelo link do WhatsApp (caminho dominante) já chega com o token — atrito zero.

**A trava (código, não promessa — guardrail 4):** novo `src/lib/pedido-identity.ts`
→ `resolvePedidoIdentity(req, restaurantId)`: lê o token (`x-pedido-token` ou `?t=`),
`verifyWaToken`, resolve o cliente **pelo telefone provado** dentro do restaurante. O
`customerId` do request nunca é confiado — é resolvido, não aceito. `null` = não revela
nada / recusa a escrita.
- `customer-profile` e `coupons`: exigem `resolvePedidoIdentity`; sem prova → `{profile:null}`/`{coupons:[]}`.
- `customer-address` POST/PATCH/DELETE: sem prova → **401**; com prova, escreve no id RESOLVIDO (o `customerId` do corpo é ignorado).
- `identify-customer` + gêmeo `qr/identify`: pararam de devolver `customerId`, `orderCount`, `totalSpent`, `lastOrderDate`. Só `found`+`name` (saudação). O pedido não precisa do id aqui — `finalize` resolve o cliente pelo telefone (`finalize/route.ts:350` + `createOrderRecord`).
- Comentário mentiroso `customer-profile/route.ts:8-9` ("no cross-restaurant/customer leakage") corrigido para descrever a trava real.

**Vetor gêmeo fechado junto (mesmo furo, outra porta):** a página SSR
`pedido/[slug]/page.tsx` renderizava o endereço default a partir de `?phone=` **cru**
(sem prova). Passei a carregar PII só do `waPayload` provado (`provenPhone`); `?phone=`
vira só pré-preenchimento do input. Nenhum remetente legítimo gera `/pedido?phone=`
(grep: só admin/diagnostics), então nada de cliente real quebra.

**O que muda para o cliente que volta:** quem chega pelo WhatsApp (com waToken)
mantém tudo — saudação, endereço default, lista de endereços, cupons, editar/apagar.
O cliente que só digita o telefone numa aba web crua **completa o pedido normalmente**
(digita o endereço, como sempre no LojaClient), mas não recebe os endereços salvos
auto-preenchidos até provar posse. Degradação graciosa (guardrail 5), não destruição.

**TODO `canais` (OTP) — a trava não espera por isso:** para devolver a conveniência
de endereços salvos ao digitador-web puro, falta um OTP (código no WhatsApp/SMS). O
**envio** é do `canais`. O ponto de integração já está pronto: o endpoint de verificação
de OTP, ao validar o código, chama `signWaToken({phone,name})` e devolve o MESMO token —
`resolvePedidoIdentity` funciona sem alteração. A trava do servidor **já está no ar
neste código**, independente do OTP.

**Client:** `page.tsx` passa `pedidoToken` (waToken validado) → `PedidoClient` resolve
o token efetivo (prop ou waToken da URL) e anexa `x-pedido-token` aos 6 fetches travados
(profile x2, coupons x2, address x3). LojaClient/QRMenuClient não chamam profile/address
— só liam `customerId`/`name` do identify; sem o id, seguem via telefone. Sem quebra.

**Verificação:** `npx tsc --noEmit` limpo; `npx vitest run` → 374 arquivos, 4708
testes, verde. Testes novos que provam a trava:
- `src/lib/pedido-identity.test.ts` (4) — sem token/forjado → null; token válido resolve pelo telefone; telefone não-cliente → null.
- `customer-profile/route.test.ts` — (a) sem prova → profile null mesmo com customerId; (b) com prova → perfil+endereços pelo telefone resolvido.
- `customer-address/route.test.ts` e `[addressId]/route.test.ts` — escrita/edição/exclusão sem prova → 401; com prova → id resolvido, corpo ignorado.
- `identify-customer/route.test.ts` — resposta sem customerId/histórico/valor.

**NÃO** foi feito deploy nem merge. Muda o fluxo do cliente → aguarda conferência humana.

**Aviso honesto:** a trava é do lado do servidor e está provada por teste, mas o fluxo
end-to-end numa loja real (WhatsApp → link → área do cliente com endereços) **não foi
exercido com humano presente** — como a impressão física, trate como conserto provado
no código até haver confirmação de operação real.

---

## 2026-08-04 · P1 — o guard anti-adulteração do finalize IGNORAVA a variante (cobrava a menos)

**Contexto:** bloco P1 aprovado pelo Diretor (04/08). Bug de dinheiro provado no E2E:
Quatro Queijos **Grande** (R$ 64,90 na tela, base R$ 52,90) → pedido gravado errado.
Afetava LojaClient E PedidoClient — mesma rota, mesmo payload.

**A causa:** `finalize/route.ts`, bloco `verifiedCart`. O guard server-side recalculava
TODA linha como `channelPrice(item base) [+promo] + opções + extras` e da variante só
gravava o `variantName` — o preço da variante escolhida nunca entrava na conta. O guard
que existia para impedir adulteração de preço era, ele próprio, a fonte do preço errado.

**A correção (princípio: cobrar o que o cliente viu, vindo do BANCO):**
- `cartItemSchema` ganhou `variantId` — **os dois clientes JÁ enviavam o campo; era o
  zod que o descartava silenciosamente** (zod remove chave desconhecida sem erro).
  Detalhe traiçoeiro: o dado certo estava no payload o tempo todo.
- Linha com variante: resolve a variante no banco (fetch sem filtro de `isAvailable`,
  para dar 400 claro de "indisponível" em vez de "não achei"), valida que pertence ao
  item da linha, e precifica com `resolveVariantPrice(item, variant, canal)` — herança
  de canal incluída (variante sem preço herda o preço de canal do produto).
- Fallback para bundle antigo em cache: sem `variantId`, resolve pela convenção do id
  de linha `${baseItemId}_${variantId}[sufixo]` (sufixos `_c<uid>` e `__upsell`).
- Variante inexistente / de outro item → 400 "Opção inválida"; indisponível → 400
  "Opção indisponível". Fail-closed: nunca cair para o preço do item base em silêncio.
- `variantName` gravado agora vem do BANCO, não do payload — a comanda não pode mentir.

**Regra promoção × variante adotada (espelho do cliente, não regra nova):** os dois
clientes NUNCA aplicam promoção em linha de variante — PedidoClient só exibe/aplica
promo quando `!item.hasVariants` (linhas 757/1235/1391; `handleVariantAdd` usa
`variant.price` seco) e o ProductModal commerce usa `selectedVariant.price` direto
(linha 109-112). O servidor espelha: variante NÃO passa pelo resolvedor de promoções.

**Verificação:** `npx tsc --noEmit` limpo; `npx vitest run` → 4729 verdes, única falha
a conhecida do ambiente (`noSideEffects.test.ts`, pré-existente). 9 testes novos em
`finalize/route.test.ts` (variante do banco, adulteração sobrescrita, variante de outro
item/inexistente/indisponível → 400, variante+opções+extras, regressão sem variante,
promo só na linha sem variante, fallback pela convenção do id). **E2E REAL contra o
Postgres local com seed:** handler real + banco real → pedido da Grande (35cm) gravado
com item 64,90 / subtotal 64,90 / total 64,90; pedido de prova removido depois.

**MESMO FURO em outro caminho — reportado, NÃO tocado (ordem do Diretor):**
1. **WhatsApp:** `WhatsAppCheckoutAdapter.validateAndPriceItems`
   (`src/services/whatsapp/ordering/WhatsAppCheckoutAdapter.ts:85,100`) — recalcula
   `channelPrice(item base)` e só carrega `variantName`. Idêntico ao bug consertado.
2. **Canal de exibição × canal de cobrança no pickup:** os clientes /pedido exibem
   preço do canal DELIVERY (`mapPedidoItem`), mas o finalize precifica pickup como
   DINE_IN. Se um restaurante tiver `priceDineIn ≠ priceDelivery`, o cliente vê um
   preço e o pickup cobra outro — pré-existente, vale para item base e variante.

**Proposta de vitrine (promoção é do Diretor):** *"O guard de preço do finalize é a
única verdade de cobrança — e linha de variante se precifica pela VARIANTE do banco,
nunca pelo item base."* Três aprendizados: (1) zod descarta campo desconhecido em
silêncio — quando o servidor precisa de um dado que o cliente já envia, a ausência no
schema é um bug invisível; (2) promoção não se aplica a linha de variante porque o
CLIENTE não aplica — o servidor espelha o que foi mostrado, não inventa regra; (3) todo
caminho que recalcula preço (finalize, WhatsAppCheckoutAdapter) precisa da mesma
resolução de variante — o do WhatsApp ainda tem o furo. Origem: bloco P1 de 04/08,
E2E real na pizzaria-demo, branch `claude/foocci-director-onboarding-lhindy`.
_(Promovida à vitrine pelo Diretor em 04/08.)_

---

## 2026-08-04 · Bloco cobrança 2/2 — pickup cobra o que a tela mostrou + variante no WhatsApp

**Contexto:** bloco aprovado pelo Diretor (04/08), duas tarefas. Fecha os dois achados
reportados no bloco P1 da manhã. Branch `claude/foocci-director-onboarding-lhindy`,
sem commit (Diretor revisa e commita).

**TAREFA 1 — decisão do CEO: retirada cobra o preço que a tela mostrou (canal DELIVERY).**
- Confirmado por grep que `/api/pedido/[slug]/finalize` só é chamado por
  `PedidoClient.tsx:4488` e `LojaClient.tsx:304` — o QRMenuClient (mesa) NÃO usa esta
  rota. E a página `/pedido` exibe TODO preço em `channelPrice(..., "DELIVERY")` e
  carrega promoções com `getActiveMenuPromotions(id, "DELIVERY")` (`page.tsx:373,388`),
  independente de o cliente depois escolher entrega ou retirada.
- `finalize/route.ts`: `pricingChannel` e `promoChannel` viraram `"DELIVERY"` fixos,
  com comentário citando a regra ("cobra-se o que a tela mostrou — decisão do CEO
  04/08"). Antes, pickup precificava DINE_IN e promocionava QR_MENU — preço e promo
  que a tela nunca mostrou.
- Conferido que a taxa de entrega NÃO depende desse canal: `resolveDeliveryFee` só
  roda no bloco `deliveryMethod === "delivery"` (route.ts:457) — retirada segue sem taxa.
- Cupom digitado (`validate-coupon` + bloco de cupom do finalize) usa o MESMO
  mapeamento nos dois lados (DELIVERY↔delivery, QR_MENU↔pickup) — preview e cobrança
  consistentes entre si; não foi tocado (é canal de CUPOM, decisão separada se um dia
  incomodar).
- Testes (i)–(i''') em `finalize/route.test.ts`: pickup com `priceDineIn ≠
  priceDelivery` cobra o DELIVERY no item base E na variante; promoção buscada e
  aplicada no canal DELIVERY mesmo no pickup; delivery inalterado (regressão).

**TAREFA 2 — mesmo furo de variante do finalize, agora no WhatsApp.**
- **Formato real da variante no carrinho do WhatsApp:** `WaOrderItem` carrega
  `variantId?` + `variantName?` (`types.ts:94-95`), preenchidos num ÚNICO ponto —
  `WhatsAppOrderStateMachine.ts:602-603` (resposta à pergunta "Tamanho/Variante").
  O matcher inicial nunca preenche variante; item com variantes vira pergunta.
- `WhatsAppCheckoutAdapter.validateAndPriceItems`: linha com variante agora resolve a
  variante no banco (fetch sem filtro de `isAvailable`, igual ao finalize), valida que
  pertence ao item, e precifica com `resolveVariantPrice(item, variante, canal)` no
  canal que o adapter já usava. Fallback defensivo: `variantName` sem `variantId`
  resolve por nome exato dentro das variantes DO item. `variantName` gravado vem do
  banco. Falha fechada: variante inválida/indisponível → `{ok:false, reason,
  replyText}` e o pedido NÃO é criado.
- **replyText nas falhas de variante é deliberado:** o mecanismo `reason`-sem-replyText
  do "item indisponível" morre em silêncio (ver achado 2 abaixo). O `blockedReply` já
  existente (`WhatsAppOrderCreationService:83` → `WhatsAppTextOrderService:440-444`)
  leva a mensagem ao cliente e escala para atendente — usei o canal que já existia.
- **Promoção no WhatsApp: NÃO existe.** Grep em `src/services/whatsapp` — zero uso de
  `getActiveMenuPromotions`/resolvedor de promoções no fluxo de pedido (só "promotion"
  de governança de runtime). Nada de promoção foi inventado no adapter.
- Testes novos: `tests/WhatsAppCheckoutAdapterVariantPrice.test.ts` (9) — preço da
  variante do banco (sessão adulterada sobrescrita), variante de outro
  item/inexistente/indisponível → falha fechada com replyText, regressão sem variante
  (tabela de variantes nem consultada), fallback por nome, variante+opções+extras,
  herança de canal. W9 e todos os testes de ordering intactos.

**Verificação:** `npx tsc --noEmit` limpo (inclusive com o trabalho em andamento do
outro agente na árvore); `npx vitest run` COMPLETO → 380 arquivos, 4743 testes, TODOS
verdes (nem a falha conhecida de `noSideEffects` apareceu nesta rodada). **E2E REAL
contra o Postgres local com seed (pizzaria-demo):** plantei `priceDineIn` 1,11/2,22 no
Quatro Queijos e na Média (30cm), pedido pickup via handler real → cobrado 52,90/52,90
(DELIVERY da tela), subtotal 105,80, nunca o DINE_IN. Pedido de prova apagado, preços
restaurados, banco conferido limpo.

**Episódio operacional:** no meio do bloco um `git stash`/`pop` externo (do agente que
mexe na Loja) passou pela árvore — verifiquei arquivo a arquivo depois do pop que as
minhas três edições voltaram intactas antes de seguir. Em repositório compartilhado ao
vivo, conferir o conteúdo depois de qualquer evento de árvore que não foi seu.

**Dois furos ENCONTRADOS durante o bloco — inicialmente só reportados, depois
FECHADOS na mesma sessão por ordem do Diretor na revisão:**
1. **WhatsApp tinha o MESMO descasamento exibição×cobrança do pickup.** A conversa
   mostra preço SEMPRE no canal DELIVERY — o menu é carregado só com
   `price`/`priceDelivery` e filtrado por `showInDelivery`
   (`WhatsAppTextOrderService.ts:47-96`), e o state machine chama
   `channelPrice(..., "DELIVERY")` em todos os pontos de exibição (linhas 388, 485,
   604, 779, 1013...). Mas o adapter cobrava `deliveryType === "DELIVERY" ?
   "DELIVERY" : "DINE_IN"`. **Fechado:** o Diretor estendeu a decisão do CEO ao
   WhatsApp — `pricingChannel = "DELIVERY"` fixo no `WhatsAppCheckoutAdapter`, com
   comentário citando a decisão. Testes (h): sessão PICKUP com `priceDineIn ≠
   priceDelivery` cobra o DELIVERY no item base (55, nunca 45) E na variante
   (override 70, nunca 62).
2. **Falha de validação do adapter sem replyText morria como "pedido anotado".**
   Quando `validateAndPriceItems` falhava só com `reason` (caso "item indisponível"),
   `WhatsAppTextOrderService.ts:485-487` respondia `buildOrderAnnotatedReply` — o
   cliente entendia que o pedido foi anotado, mas NENHUM pedido existia. **Fechado:**
   o caso "item indisponível" agora devolve `replyText` pelo mesmo canal
   `blockedReply` usado nas falhas de variante — resposta clara + escalada para
   atendente, nunca "anotado" sem pedido. Teste (i) cobre o caso.

**Proposta de vitrine (promoção é do Diretor):** complementar a entrada existente do
guard de preço com: *"Canal de cobrança = canal de EXIBIÇÃO, nunca o canal 'lógico' do
método de entrega. As duas superfícies de pedido (clientes /pedido E conversa do
WhatsApp) mostram tudo em DELIVERY, então pickup cobra DELIVERY nas duas (decisão do
CEO 04/08, estendida ao WhatsApp pelo Diretor). Todo caminho novo de checkout deve
responder primeiro 'que canal a tela usou?'. E toda falha de validação do checkout do
WhatsApp carrega replyText — falha sem resposta vira 'pedido anotado' falso."*
Origem: este bloco, E2E real na pizzaria-demo, branch
`claude/foocci-director-onboarding-lhindy`.

---

## 04/08 — Checkout self-service: do card de preço à conta rodando (Frente 1)

**Branch:** `claude/foocci-brain-vaamrx` · **Verificação:** `npx tsc --noEmit` limpo ·
`npx vitest run` 4818/4820 (as 2 falhas são `quality/noSideEffects` e
`whatsapp/WhatsAppOrderingW8`, timeouts de 5s por falta de Postgres no sandbox —
provado idêntico no commit `024400ae`, anterior a este trabalho; W8 passa isolado).

### O que existia e o que faltava
Já existia metade: `PlanSubscriptionService`, `createPreapproval`, webhook, aceite
versionado, `RestaurantService.register`. Faltava a ponta pública e **a costura**:
`PlanSubscription.restaurantId` não era escrito por ninguém, então pagamento
confirmado não virava conta.

### O buraco central, e por que a idempotência não podia ser um `if`
`PlanProvisioningService.provision` cria restaurante + dono OWNER + vínculo com a
assinatura numa transação só. A trava contra restaurante duplicado **não é código**:
é o índice UNIQUE `restaurants.originSubscriptionId` (migration
`20260804120000_checkout_self_service`). O webhook do MP é retryable por contrato;
uma checagem em código perderia a corrida entre o SELECT e o INSERT. Com o UNIQUE,
o segundo processamento estoura P2002 e a transação inteira volta atrás — sem
restaurante órfão, sem usuário pela metade. O serviço trata P2002 como
"já feito", não como erro (`PlanProvisioningService.ts:193-201`).

**Sub-decisão:** slug ocupado entre o checkout e o pagamento NÃO custa a conta de
quem pagou — sufixa (`-2`, `-3`) e registra. Perder a conta de um cliente pagante
por causa de um endereço ocupado seria muito pior; a tela pós-pagamento mostra o
endereço real, então o cliente vê a verdade.

### G2 (dupla cobrança) — a corrida também precisava de resposta
`ensurePreapproval` (`PlanSubscriptionService.ts:174-232`) resolve DOIS cenários,
não um. O reenvio sequencial devolve o link guardado sem tocar o MP. Mas na corrida
real os dois requests criam no MP; a gravação é `updateMany` com
`mpPreapprovalId: null`, e **o perdedor cancela no MP o preapproval órfão que
acabou de criar**. Sem esse cancelamento a corrida deixaria uma recorrência viva
que nenhum registro nosso aponta — cobrança fantasma, invisível para sempre. Se o
cancelamento do órfão falhar, sai `console.error` com o id a cancelar à mão.

### G4 (ativar sem aceite) — dentro do UPDATE, e sem jogar dinheiro fora
`termsAcceptedAt: { not: null }` entrou no `where` do mesmo `updateMany` atômico
que já filtrava estados terminais. Guardrail 5 aplicado: recusar ativação **não**
descarta a cobrança — o webhook registra a PlanInvoice e enfileira a NFS-e antes
de decidir sobre ativar (dinheiro que entrou é fato fiscal; o que fica retido é só
o acesso). O log carrega cliente, plano e o link de aceite para resolver.

### Preço: quatro fontes viraram uma
`src/lib/billing/pricing.ts` é a fonte única. `precos/page.tsx`, `lib/site/plans.ts`,
o `PLAN_MONTHLY_CENTS` do serviço e o `MONTHLY_DEFAULT` do admin agora leem dela.
Três achados:
1. O admin sugeria **preço de ciclo sem desconto** (`179 × 3 = 537` em vez de 483,
   `179 × 12 = 2148` em vez de 1790). Corrigido junto — era cobrança acima do
   anunciado esperando acontecer.
2. **"Preço fundador" saiu do site.** Decisão do CEO: não existe no motor. Anunciar
   desconto que o motor não aplica é o mesmo furo ao contrário.
3. **50% de R$ 179,00 é R$ 89,50, não R$ 89,00.** O site anunciava arredondado. A
   página agora imprime o mesmo centavo que o cartão paga. Não arredondei para
   fazer bater — o número mudou no anúncio, não na cobrança.

### O degrau de preço no Mercado Pago — a parte que NÃO foi verificada de verdade
O preapproval do MP tem UM valor recorrente; não existe campo de "primeira parcela
diferente". Então: nasce com `firstChargeCents` e é elevado a `priceCents` por
`PUT /preapproval/{id}` quando a primeira cobrança confirma (`syncFullAmount`).
**Este PUT nunca rodou contra a API real do Mercado Pago** — só contra mock. Se o MP
recusar o formato, o cliente paga metade para sempre. Por isso o carimbo
`fullAmountSyncedAt` é DESFEITO na falha e `priceSyncError` fica gravado e visível no
admin. Mas isso é conserto no papel: **precisa de uma contratação real de ponta a
ponta para provar.** Registrado como pendência.

### Arquivos
`src/lib/billing/pricing.ts` · `src/lib/billing/checkout-slug.ts` ·
`src/services/billing/PlanProvisioningService.ts` ·
`src/services/billing/PlanSubscriptionService.ts:174-232,235-275,277-318` ·
`src/services/billing/MercadoPagoPlatformBilling.ts:38-84,86-120` ·
`src/app/api/billing/checkout/route.ts` · `src/app/api/billing/slug-check/route.ts` ·
`src/app/api/billing/mp-webhook/route.ts:30-40,73,110-127` ·
`src/app/contratar/novo/{page,CheckoutClient}.tsx` ·
`src/app/contratar/obrigado/page.tsx` · `src/app/site/(gated)/precos/page.tsx` ·
`src/lib/site/plans.ts` · `src/app/admin/(area)/assinaturas/AssinaturasClient.tsx` ·
`prisma/migrations/20260804120000_checkout_self_service/migration.sql`

**Testes:** `pricing.test.ts` (9) · `PlanProvisioningService.test.ts` (10) ·
`checkout/route.test.ts` (11) · `mp-webhook/route.test.ts` (8) ·
`PlanSubscriptionService.test.ts` (12) · `admin .../action/route.test.ts` (7).

### Proposta de vitrine (promoção é do Diretor)

> **Idempotência de dinheiro mora no índice do banco, não no `if` do serviço — e
> quem perde a corrida limpa o que criou fora.**
>
> Todo caminho que cria cobrança ou conta a partir de evento externo (webhook de
> gateway, POST público) é reexecutado: o Mercado Pago reenvia por contrato, e o
> cliente reenvia por duplo clique. Três regras aprendidas construindo o checkout
> self-service:
>
> 1. **A trava é o UNIQUE.** `restaurants.originSubscriptionId` (e
>    `plan_subscriptions.signupIdempotencyKey`) fazem o segundo processamento
>    estourar P2002 dentro da transação, que volta atrás inteira. Checagem só em
>    código perde a janela entre o SELECT e o INSERT. **P2002 nesse índice é
>    "já feito", não erro.**
> 2. **Perder a corrida obriga a limpar fora.** Dois requests criaram preapproval
>    no MP; só um grava. O perdedor **cancela o órfão no gateway** — senão fica
>    uma recorrência viva que nenhum registro nosso aponta: cobrança fantasma,
>    invisível para sempre. Recurso criado em sistema externo e não gravado no
>    nosso banco é vazamento, igual a estado sem prazo.
> 3. **Pré-condição de negócio vai no `where` do UPDATE, não num `if` antes dele.**
>    "Não ativa sem aceite de contrato" virou `termsAcceptedAt: { not: null }` no
>    mesmo `updateMany` que já filtrava estado terminal. E recusar ativação **não**
>    descarta o dinheiro que entrou: a cobrança e a NFS-e são registradas antes da
>    decisão; o que fica retido é o acesso (guardrail 5).
>
> — origem: oficina 04/08, Frente 1 (checkout self-service), branch
> `claude/foocci-brain-vaamrx`

> **Preço anunciado e preço cobrado precisam ser o MESMO objeto — e o arredondamento
> é do anúncio, nunca da cobrança.**
>
> Havia quatro tabelas de preço no repositório. Enquanto a venda era 1:1 isso era
> dívida; com checkout self-service vira cobrança diferente do anunciado no primeiro
> cliente. Unificadas em `src/lib/billing/pricing.ts`, que a página pública, o
> checkout, o motor e o admin leem. Dois achados que só apareceram na unificação:
> o admin sugeria ciclo **sem** o desconto do trimestral/anual, e o site anunciava
> "1º mês R$ 89" para uma cobrança de R$ 89,50. Ajustou-se o **anúncio** para o
> centavo real — nunca o contrário.
>
> — origem: oficina 04/08, Frente 1, decisão de preço do CEO de 04/08

---

## 2026-08-04 · Foocci Bakery — a padaria de degustação (Frente 3 do lançamento)

**Contexto:** o CEO quer que o visitante do site experimente as três superfícies de
atendimento antes de comprar. Parte 1 (esta): criar a padaria e o cardápio. Parte 2
(aba de degustação no site) é da `interface`. Worktree a partir de
`claude/foocci-brain-vaamrx`.

**Terreno levantado antes de escrever qualquer linha:**
- `RestaurantService.register()` (`src/services/restaurant/RestaurantService.ts:33`)
  cria restaurante + dono numa transação e dispara os defaults **fire-and-forget**.
  Não serve para seed: se `createRestaurantDefaults` falhar, ninguém fica sabendo e
  o restaurante nasce meio configurado. O seed chama
  `RestaurantDefaultsService.createRestaurantDefaults()` direto, **aguardando** — o
  serviço já é idempotente por construção (`RestaurantDefaultsService.ts:22`).
- `scripts/import-sushi-cazza.ts` é o padrão de import idempotente que existia:
  `findFirst` + create/update, porque `MenuCategory` **não tem unique em
  (restaurantId, name)**. Reaproveitado em vez de inventar caminho.
- `prisma/seed.ts` (pizzaria-demo) só cria restaurante+dono, sem cardápio.
- `prisma migrate deploy` **não sobe num banco vazio** neste repo (a cadeia de
  migrações quebra em `relation "orders" does not exist`). Para banco novo, é
  `prisma db push`. Registrado porque isso já vai custar tempo de alguém.

**O que ficou pronto:**
1. `prisma/schema.prisma:34` — `Restaurant.isDemo Boolean @default(false)` +
   migração `prisma/migrations/20260804090000_restaurant_is_demo/migration.sql`.
2. `src/lib/demo-restaurant.ts` — filtros canônicos (`REAL_RESTAURANTS_ONLY`),
   `assertNotDemoRestaurant()` com **falha fechada** (restaurante inexistente
   também não passa: ausência não é prova, guardrail 1).
3. `src/services/billing/PlanSubscriptionService.ts:62` — a trava ligada no ponto
   que cobra: `create()` recusa vincular restaurante de vitrine, ANTES da escrita.
4. `src/app/api/admin/restaurants/route.ts:41,83` — `isDemo` na resposta da lista.
5. `scripts/foocci-bakery.data.ts` — 7 categorias, 40 itens, 31 variantes, 10
   adicionais, 7 grupos de opção (29 opções). Com `ingredients`, `tagFunil`,
   `perfilPaladar`, `alergenosDetalhados`, `storytellingIA` e `harmonizacaoSugerida`
   preenchidos — é o que o Garçom lê para responder alérgeno e sugerir par.
6. `scripts/seed-foocci-bakery.ts` (`npm run bakery:seed`) — idempotente, com
   `--dry-run` e `--prune`.
7. `scripts/foocci-bakery-images.ts` (`npm run bakery:imagens`) — geração de foto
   pelo `gpt-image-1`, mesmo modelo e mesmo armazenamento
   (`src/services/imageEnhancement/storage.ts`) já usados pelo realce. Nenhuma
   dependência nova, nenhuma foto baixada de terceiro.

**Decisões que valem registro:**
- **A marca de demonstração é COLUNA, não convenção de slug.** Slug é nome; nome
  se renomeia e não serve de filtro de banco. Guardrail 4 aplicado a dado.
- **Preço: um só por item, sem preço por canal.** Padaria cobra o mesmo no salão e
  no delivery, e canal com preço diferente é exatamente onde esta casa já errou
  cobrança. Preço base = variante mais barata (vira o "a partir de").
- **Campo fiscal e CNPJ ficam VAZIOS.** Nota fiscal não admite chute, e NCM errado
  numa vitrine é NCM errado copiado por um lojista que confia na vitrine.
- **Custo (`cost`) é FICTÍCIO e está declarado como tal** no cabeçalho do arquivo de
  dados. A lei "markup em cima de custo inventado é pior que não ter CMV" protege
  lojista de verdade; aqui não há lojista e o tenant nasce `isDemo`. Sem custo, a
  página de precificação não teria o que demonstrar.
- **Senha do dono nunca é embutida.** Vem de `FOOCCI_BAKERY_OWNER_PASSWORD` ou é
  sorteada e impressa uma vez. Re-execução não troca a senha de dono existente.
- **Imagem é passo separado e pago.** Um seed que gasta dinheiro sem avisar é
  armadilha: nada acontece sem `--yes`. Falha de foto registra o item e segue —
  item sem foto cai no estado vazio da loja (emoji), e URL quebrada é pior que
  nenhuma foto.
- **O script de imagem só roda em `isDemo = true`.** Foto de IA em cardápio de
  cliente real é vender um prato que ele nunca fez.

**Verificado de verdade (banco Postgres local, não produção):**
- `npx tsc --noEmit` limpo · `npx vitest run` 381 arquivos / 4754 testes verdes.
- Seed rodado 3×: contagem final estável em 7 categorias / 40 itens / 31 variantes
  / 10 adicionais / 7 grupos / 29 opções. Não duplica.
- `next dev` local: `/qr/foocci-bakery` **200**, `/pedido/foocci-bakery?modo=loja`
  **200**, `/pedido/foocci-bakery` **200**. Os três com conteúdo do cardápio no
  HTML, e a cor de marca `#8A4B1E` aplicada (white-label funcionando). O modo IA
  renderiza a conversa (`placeholder="Peça uma sugestão…"`), o `?modo=loja`
  renderiza o catálogo — são componentes diferentes, confirmado pelo HTML.

**O que NÃO foi provado:** as fotos. Não há `OPENAI_API_KEY` neste ambiente, então
nenhuma imagem foi gerada — os 40 itens estão com `imageUrl` nulo e a loja mostra o
estado vazio. O script está escrito e o ensaio (`--dry-run` implícito, sem `--yes`)
imprime o comando exato que iria ao modelo, mas **nenhuma foto desta padaria existe
ainda**. Tratar como preparado, não como entregue.

**Achado colateral para a `interface`:** `categoryEmoji()`
(`src/app/pedido/[slug]/PedidoClient.tsx:484`) é chamada com o **nome do item** e
não conhece nenhuma palavra de padaria — todo item sem foto cai no 🍽️ genérico.
Enquanto não houver foto, a vitrine fica com 40 pratos iguais. Não mexi: tela é
domínio da `interface`.

**Proposta de vitrine (promoção é do Diretor):** *"Vitrine é tenant de verdade, e
por isso precisa de marca no DADO. O que existe para demonstrar (padaria, sandbox,
treino) roda com o mesmo código do cliente pagante — é isso que faz a demonstração
valer, e é isso que a torna indistinguível de um cliente numa consulta descuidada.
A marca é a coluna `Restaurant.isDemo`, nunca o nome do slug, e ela só vale se
estiver LIGADA nos pontos que doem: cobrança (`PlanSubscriptionService.create`
recusa vitrine, com falha fechada para restaurante inexistente) e listagem
comercial (`REAL_RESTAURANTS_ONLY`). Toda superfície nova que conta, cobra ou
fatura restaurante começa perguntando: 'e a vitrine, entra nessa conta?'"*
Origem: este bloco, worktree da Frente 3 a partir de `claude/foocci-brain-vaamrx`;
arquivos `src/lib/demo-restaurant.ts` e `src/lib/demo-restaurant.test.ts`.

---

## 2026-08-04 · Os dois botões da padaria de vitrine no admin (branch `claude/foocci-brain-vaamrx`)

**Pedido:** o CEO não roda terminal, e só a produção tem banco e `OPENAI_API_KEY`.
Criar em `/admin/padaria-vitrine` dois botões — criar/atualizar a padaria e gerar
as 40 fotos — sem duplicar a lógica dos scripts.

**O que fiz.** Extraí tudo para `src/services/demo/FoocciBakeryService.ts` e
transformei os dois scripts em bocas de linha de comando (`scripts/seed-foocci-bakery.ts`
caiu de 598 para 92 linhas; `scripts/foocci-bakery-images.ts`, de 181 para 110). O
arquivo de dados saiu de `scripts/` para `src/services/demo/foocci-bakery.data.ts`
porque `tsconfig.json` exclui `scripts/` — código de app não pode importar de lá.
Rotas: `/api/admin/demo-bakery/seed` e `/api/admin/demo-bakery/imagens`, ambas com
`checkAdminRequest`.

**Três coisas que o trabalho ensinou:**

1. **Mover lógica de `scripts/` para `src/` a submete a portões que o script
   nunca sentiu.** O `scripts/foocci-bakery-images.ts` importava `@/lib/openai`
   direto e ninguém reclamava: `scripts/` está fora do `tsconfig` e fora do
   varredor da Regra de Ouro do Brain. No instante em que a mesma linha entrou em
   `src/`, `src/services/brain/architecture.test.ts` quebrou o build. **Não
   adicionei o arquivo à lista congelada** (a lista só diminui — guardrail 3):
   movi a chamada para `src/services/imageEnhancement/providers/openai.ts:41`, que
   já é o lugar autorizado a falar com a API de imagem. Efeito colateral bom: hoje
   existe UM ponto em `src/` que gera foto por IA.
   → *Regra que sobra:* script não é rascunho de serviço. Se ele vai virar botão,
   ele vai passar nos portões — e é melhor descobrir isso extraindo do que na CI.

2. **"Não gastar duas vezes" precisa de duas travas, e elas protegem coisas
   diferentes.** O empréstimo com prazo (`Lease`, `FoocciBakeryService.ts:96`)
   segura o duplo clique dentro do mesmo processo. Ele NÃO segura o admin e o
   terminal rodando juntos. O que segura isso é a re-leitura do `imageUrl`
   imediatamente antes de cada chamada paga (`:970`): se a foto apareceu no
   caminho, pula sem gastar. Escrevi teste para os dois cenários separadamente —
   o segundo é o que um mock de contagem de chamadas jamais provaria.

3. **Duas definições de "tem chave?" são um botão que mente.** Meu `hasOpenAiKey`
   aceitava qualquer string não vazia; o provedor exige `length > 10`. Uma chave
   curta passaria pelo botão e viraria 40 falhas por item em vez de uma frase. Uni
   as duas em `isOpenAiImageConfigured()` (`providers/openai.ts:41`), importada,
   não recopiada. Quem pergunta "posso oferecer?" e quem gasta têm que usar a
   mesma régua.

**Sobre o estado que prende trabalho (a lei do domínio).** A geração roda em
segundo plano no servidor e o progresso vive no processo, não no banco. Nasceu com
prazo (`IMAGE_LEASE_MS = 180s`, renovado a cada foto) e com quem o resgata: quem
LÊ o estado depois do prazo declara `ABANDONADO` (`reapIfExpired`), com a frase que
explica ao CEO que as fotos prontas ficaram salvas. Sem isso, um restart do Railway
deixaria a tela girando para sempre.

**O que NÃO está provado:** nada disto rodou contra o banco de produção nem contra
a OpenAI de verdade. As 40 fotos continuam sem existir. As provas são de banco de
mentira em memória e de rota com serviço substituído — provam a lógica e o
contrato, não a fatura. Só o clique do CEO em produção fecha isso.

**Achado que não é meu:** `src/services/quality/noSideEffects.test.ts` falha por
tempo esgotado (5s) **no HEAD desta branch, sem nenhuma alteração minha** —
confirmei em worktree limpo. Não toquei: é domínio da `qualidade`.

**Proposta de vitrine (promoção é do Diretor):** *"Script de operação que vira
botão muda de jurisdição. Enquanto mora em `scripts/`, ele está fora do tsconfig e
fora dos portões estruturais do repositório; ao ser extraído para `src/`, passa a
responder pela Regra de Ouro do Brain e pelo gate de rota admin. A extração é a
hora de obedecer aos portões, nunca de ampliar a lista de exceções deles — a lista
congelada só diminui. E o serviço extraído passa a ter DOIS chamadores com
permissões diferentes: o terminal (que tem operador olhando) e o botão (que não
tem). Toda trava que existia como 'o operador confere antes' vira código."*
Origem: este bloco; arquivos `src/services/demo/FoocciBakeryService.ts`,
`src/services/imageEnhancement/providers/openai.ts:41`,
`src/services/brain/architecture.test.ts` (portão que cobrou).

---

## 2026-08-04 · A padaria de vitrine deixa de depender de clique

**Pedido:** a Foocci Bakery existia como código e como botão, mas não existia no
banco de produção — o botão nunca tinha sido clicado. Fazer nascer e se manter
sozinha a cada deploy, sem poder derrubar o boot.

**O que fiz:**
- `src/services/demo/bakerySelfSeed.ts` — orquestração de deploy: seed idempotente
  + disparo das fotos que faltam. **Não lança em nenhum caminho.** Chama o mesmo
  `FoocciBakeryService` do botão; nenhuma segunda cópia.
- `src/app/api/admin/demo-bakery/self-seed/route.ts` — a rota que o boot chama.
  200 = em dia (script para de tentar), 503 = tente de novo (banco fora).
- `scripts/start-production.sh:33-56` — Step 4, cópia estrutural do passo dos
  guias: subshell em segundo plano, 3 tentativas (40/60/90s), `|| echo "000"`,
  pula sem ADMIN_SECRET. `next start` virou Step 5 e não espera por nada disso.
- `FoocciBakeryService.ts` ganhou `onSettled` em `startBakeryImageJob` — quem
  dispara no deploy não tem tela para ler o total gerado.

**Decisões que valem registro:**
1. **Sem `prune` no caminho automático.** Podar cardápio num boot é destruição
   silenciosa (guardrail 5). Podar continua sendo escolha de botão.
2. **`regerar: false` por escrito, não por omissão.** É o caminho que roda sem
   ninguém olhando; a omissão faria a mesma coisa hoje e outra coisa amanhã.
3. **`NADA_A_FAZER` é o caminho FELIZ do segundo deploy**, não uma falha — o
   serviço o expressa como recusa e o orquestrador o traduz de volta.
4. **Sem seed OK, nenhuma foto é disparada.** Sem cardápio no banco não há o que
   fotografar, e insistir produziria um erro por deploy.
5. **`FOOCCI_BAKERY_SELF_SEED=off`** desliga sem precisar de deploy novo. Só o
   valor explícito `off` desliga; ausência é ligado.

**Trava contra gastar duas vezes com N réplicas:** o `Lease` é por processo. Quem
sobrevive a dois processos subindo juntos é a re-leitura do `imageUrl`
imediatamente antes de cada chamada paga (`FoocciBakeryService.ts:976-985`) —
já existia e continua sendo a única trava que vale entre processos.

**Provas:** `bakerySelfSeed.test.ts` (falha do seed não derruba o boot, em três
formatos de erro; `regerar: false`; sem chave registra e segue; script chama a
rota em segundo plano antes do `next start`), `self-seed/route.test.ts` (401,
200, 503, e responde mesmo se o orquestrador explodir), +2 em
`FoocciBakeryService.test.ts` (`onSettled` relata o total; `onSettled` que explode
não derruba a geração). `npx tsc --noEmit` limpo · `npx vitest run` 4894/4894.

**O que NÃO está provado:** nada rodou contra o banco de produção nem contra a
OpenAI de verdade. A padaria continua sem existir em produção e as 40 fotos
continuam sem sair. Só o deploy fecha isso — e ninguém deve dizer "está no ar"
antes de o `/pedido/foocci-bakery` responder.

**Proposta de vitrine (promoção é do Diretor):** *"Vitrine que depende de alguém
clicar é vitrine vazia. Todo estado de demonstração que o CEO precisa ver no ar
nasce no boot, idempotente, e o boot nunca pode cair por causa dele: o passo roda
em segundo plano DEPOIS do `next start`, com tentativas contadas, e toda falha
vira registro com a evidência em vez de exceção. E o caminho automático é sempre
o mais conservador dos dois — sem poda, sem regeração, sem gasto que o caminho
manual faria com um humano olhando."* Origem: este bloco; arquivos
`src/services/demo/bakerySelfSeed.ts`,
`src/app/api/admin/demo-bakery/self-seed/route.ts`,
`scripts/start-production.sh:33-56`.
