# Oficina — operação

> Append-only. O especialista escreve; o Diretor promove para a vitrine.

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
