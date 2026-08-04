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
