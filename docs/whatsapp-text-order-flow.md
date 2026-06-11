# WhatsApp — Anotador de Pedido por Texto

> Atualizado em 2026-06-10 (branch `claude/remove-legacy-runner-q8iXa`).
> O WhatsApp Agent atua como **anotador inteligente de pedido**: entende texto
> livre, consulta o cardápio real, monta a comanda e finaliza **pelo mesmo fluxo
> do Fute** — representado em texto com opções numeradas. Sem UI nova, sem
> checkout paralelo, sem Pix paralelo.

## Papel: anotador, não vendedor

- O **Waiter** (em `/pedido`) é o vendedor consultivo.
- O **WhatsApp** neste fluxo é o **anotador**: entende, localiza produtos reais,
  resolve ambiguidade com opções numeradas, confirma entrega/pagamento e fecha
  pelo backend existente. Se travar ou o cliente pedir humano → atendente
  (fallback, nunca caminho principal).

## Mesmo fluxo do Fute (onde cada coisa acontece)

| Etapa | Implementação (compartilhada com o Fute) |
|---|---|
| Itens/comanda | `WhatsAppOrderStateMachine` (pura) sobre o cardápio real |
| Pedido | `WhatsAppOrderCreationService` → `createOrderRecord` (mesmo backend do checkout) |
| Pix/link | `WhatsAppPaymentService` → `createPixPayment` (`lib/mercadopago`, mesmo fluxo; pedido só aparece na operação pela MESMA regra) |
| Formas de pagamento | `checkoutBridge.getConfiguredPaymentOptions` → **PaymentSettings** (a mesma tabela do Fute); render numerado `renderPaymentQuestion` |
| Endereço salvo | `checkoutBridge.getSavedAddressForCustomer` → último endereço de entrega (Address do pedido, read-only) |

## Comunicação obrigatória — `0. menu`

- **Toda mensagem ativa do fluxo termina com exatamente `0. menu`**
  (`menuFooter.withMenuFooter`, aplicado no ponto único `done()` da máquina;
  variantes como "0. voltar ao menu principal" são normalizadas).
- Estados terminais (cancelado/handoff) não levam rodapé (saem do fluxo).
- **`0`** volta ao menu principal. Com comanda em andamento, **nunca descarta
  sem confirmação**: pergunta `1. Continuar pedido / 2. Descartar pedido /
  3. Falar com atendente` (+ `0. menu`).

## Fluxo (resumo)

1. Texto livre → Brain Adapter: `ORDER_BY_TEXT` + `START_TEXT_ORDER_DRAFT` +
   `extractedEntities {items, paymentMentioned, deliveryMentioned}`.
2. Máquina consulta o cardápio real; ambiguidade → opções numeradas
   (`1 — Yakisoba Frango — R$ 39,90 …`); inexistente → "não encontrei" (nunca
   inventa item/preço).
3. Comanda provisória → entrega/retirada → endereço (oferece o **salvo**:
   `1. Sim / 2. Usar outro endereço`).
4. **Pagamento oficial**: opções numeradas vindas do PaymentSettings
   (`metadata.paymentQuestion` + `paymentOptionOrder`; número mapeia a opção).
   Pagamento **declarado** ("vou pagar em dinheiro") é pré-selecionado mas ainda
   confirmado: `Você informou dinheiro… 1. Sim / 2. Escolher outra forma`.
   Dinheiro → pergunta **troco** (e "troco para quanto?").
5. Revisão final → confirmação → `CREATE_ORDER` (na entrega) ou
   `CREATE_ORDER`+`GENERATE_PIX` (Pix, QR/copia-e-cola pelo fluxo existente).
   **Nada finaliza sem confirmação.**

## Modo seguro / flag (como ativar)

O fluxo continua atrás do gating existente do text-ordering:
`WHATSAPP_TEXT_ORDERING_ENABLED/PAUSED` + config por restaurante + **allowlist de
telefones** + modos `DRY_RUN_ONLY` (não responde) → `ALLOWLIST_REPLY_ONLY`
(responde, sem pedido/Pix) → `ALLOWLIST_FULL_TEST` (pedido/Pix reais). As
melhorias novas (rodapé/0/pagamento oficial/endereço salvo) são parte da máquina
e dos metadados de sessão — nenhum modo foi alterado.

## Eventos de timeline (observabilidade — `orderingEvents.ts`)

Contrato puro de eventos (sem PII, sem DB, sem runtime) — fonte única do que
acontece em cada turno, para o runtime/CRM persistir depois atrás dos mesmos
gates: `text_order_started`, `item_matched`, `item_ambiguous`, `item_not_found`,
`cart_reviewed`, `delivery_selected`, `saved_address_offered`, `payment_selected`,
`order_confirmed`, `pix_generated`, `handoff_requested`, `menu_returned`,
`flow_cancelled`. `deriveOrderingEvents(step)` é determinístico e deixa explícito
se a ação foi IA / humano / sistema (`TimelineActor`).

## Simulador (validação sem celular)

O simulador roda a máquina real sobre cardápio/pagamento/endereço sintéticos e
prova a jornada inteira (transcript + comanda + `WOULD_CREATE_ORDER`/
`WOULD_GENERATE_PIX` + segurança) sem enviar WhatsApp nem criar pedido/Pix.
Cockpit admin `/admin/agents/whatsapp`; cron `POST /api/cron/whatsapp/text-order-simulator`.
É a **primeira etapa** de validação — ver `docs/whatsapp-text-order-simulator.md`.

## Diagnóstico seguro

`POST /api/cron/whatsapp/text-order-diagnostic` (Bearer CRON_SECRET) — catálogo
sintético + máquina pura + adapter: pedido livre, retirada, Pix declarado,
produto inexistente, atendente e `0` com comanda. Critérios: PASS, p0=0,
`noSend/noEvolution/noOrder/noPix`, `runtimeTouched=false`. Não toca o banco.

Checks operacionais adicionais (ativação v1): `runtimeMetadataInjected`,
`paymentOptionsFromFute` (a pergunta numerada reflete só as formas configuradas),
`savedAddressLoaded`, `replyOnlyNoOrder`, `fullTestOrderOnlyAfterConfirmation`,
`pixOnlyAfterConfirmation`. Workflow manual:
`.github/workflows/whatsapp-text-order-diagnostic.yml` (CRON_SECRET, logs seguros).

## Como o runtime injeta (ativação v1)

O `WhatsAppTextOrderingRuntimeService`, depois de carregar/criar a sessão e ANTES
da máquina, chama `enrichSessionMetadata` (checkoutBridge):
- **Pagamento oficial:** `metadata.paymentQuestion` + `paymentOptionOrder` +
  `paymentOptions` ← `PaymentSettings` do restaurante (mesma tabela do Fute).
  Ordem estável PIX→Cartão→Dinheiro filtrada pelo que está ligado; número digitado
  mapeia para o método oficial; nada é inventado.
- **Endereço salvo:** `metadata.savedAddress` ← último endereço de entrega do
  cliente (somente com `customerId` seguro e enquanto a sessão não tem endereço;
  a oferta "1. Sim / 2. Usar outro" só aparece no fluxo de DELIVERY).
- **Garantias:** injeção única por sessão (não sobrescreve), `bridgeInjectedAt`
  para observabilidade, e **nunca lança** — falha de DB cai nos defaults seguros
  da máquina, sem bloquear o turno.

## Modos (gates reforçados — `modePermissions`, fonte única testada)

| Modo | Responde? | Pedido real? | Pix real? |
|---|---|---|---|
| `DRY_RUN_ONLY` | ❌ | ❌ | ❌ |
| `ALLOWLIST_REPLY_ONLY` | ✅ (só allowlist) | ❌ | ❌ |
| `ALLOWLIST_FULL_TEST` | ✅ (só allowlist) | ✅ após confirmação | ✅ após confirmação |

Nenhum modo burla a allowlist (o guard de telefone roda antes de tudo); pedido e
Pix só viram ações no FIM do fluxo confirmado (`CREATE_ORDER`/`GENERATE_PIX`),
executadas pelo backend do Fute apenas em FULL_TEST.

## Scope `RESTAURANT_WIDE` — exige aprovação explícita

`RESTAURANT_WIDE` expõe o fluxo a QUALQUER cliente real. Por isso só é tratado
como intencional quando há o marcador de aprovação `[RW_APPROVED]` no campo
`notes` da config (sign-off humano auditável — ex.: change request do Brain
Director aprovado). Sem o marcador, uma config `RESTAURANT_WIDE` viva (enabled,
não pausada, modo que responde) é **exposição acidental → `riskLevel=HIGH`** no
diagnóstico. Com o marcador, vira exposição intencional (`MEDIUM`).

## Correção de segurança (somente reduz exposição) — `secureScope`

`POST /api/cron/whatsapp/text-order-secure-scope` (Bearer CRON_SECRET, workflow
`whatsapp-text-order-secure-scope.yml`) é o ÚNICO caminho de escrita disponível
para CI (que não tem ADMIN_SECRET) e só consegue **reduzir** exposição: força
`scope=PHONE_ALLOWLIST`, rebaixa o modo para no máximo `ALLOWLIST_REPLY_ONLY`,
preserva a allowlist (opcionalmente adiciona um telefone do time). Nunca abre
`RESTAURANT_WIDE`, nunca liga `FULL_TEST`, nunca envia/cria pedido/Pix.
Idempotente. Para qualquer mudança que AUMENTE exposição, use o admin
(`ADMIN_SECRET`) deliberadamente.

## Como ativar por allowlist

1. Painel admin do restaurante: habilitar text-ordering, modo
   `ALLOWLIST_REPLY_ONLY`, adicionar os telefones do time na allowlist.
2. Validar no aparelho: rodapé `0. menu`, opções numeradas, pergunta de pagamento
   refletindo só as formas configuradas, oferta de endereço salvo.
3. Subir para `ALLOWLIST_FULL_TEST` (mesmos telefones): pedido na entrega +
   pedido Pix ponta a ponta.
4. Só então considerar `RESTAURANT_WIDE`.

## Critérios para ativar produção (geral)

1. Validar em `ALLOWLIST_REPLY_ONLY` com telefones do time (respostas reais, sem
   pedido) — conferir rodapé, opções numeradas e pagamento oficial no aparelho.
2. `ALLOWLIST_FULL_TEST` com restaurante de teste: pedido na entrega + pedido Pix
   ponta a ponta (pedido aparece na operação pela regra do Fute).
3. ✅ ~~Popular metadata no runtime~~ — FEITO (ativação v1: `enrichSessionMetadata`
   ligado no RuntimeService).
4. ✅ ~~Resolver as 3 falhas do matcher de "menu question" (W8/W9)~~ — FEITO
   (pergunta de cardápio não cita mais a frase como produto inexistente).
5. Só então ampliar a allowlist / `RESTAURANT_WIDE` **com `[RW_APPROVED]`**.

## Readiness de produção — `POST /api/cron/whatsapp/text-order-readiness`

Compõe o config diagnostic (config viva + risco) com o flow diagnostic (prova
hermética da máquina) num checklist único: `replyOnlyReady`, `fullTestReady`,
`restaurantWideReady` + `blockers` / `warnings` / `requiredNextActions`.
`restaurantWideReady` exige `[RW_APPROVED]`, flow PASS (p0=0) e risco ≠ HIGH; os
gates validados por humano (REPLY_ONLY/FULL_TEST no aparelho, sign-off do Brain
Director) aparecem como ações requeridas, nunca são auto-aprovados. Somente
leitura, `runtimeTouched=false`. Workflow `whatsapp-text-order-readiness.yml`.

## Pendências conhecidas

- O retorno ao "menu principal" após `0` emite `MENU_RETURN`; a renderização do
  menu do recepcionista é do router (fora da máquina pura).
- Persistência da timeline (`orderingEvents`) no runtime/CRM ainda é passo
  seguinte (atrás dos mesmos gates); hoje o contrato de eventos é puro/testado.
