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

## Diagnóstico seguro

`POST /api/cron/whatsapp/text-order-diagnostic` (Bearer CRON_SECRET) — catálogo
sintético + máquina pura + adapter: pedido livre, retirada, Pix declarado,
produto inexistente, atendente e `0` com comanda. Critérios: PASS, p0=0,
`noSend/noEvolution/noOrder/noPix`, `runtimeTouched=false`. Não toca o banco.

## Critérios para ativar produção (geral)

1. Validar em `ALLOWLIST_REPLY_ONLY` com telefones do time (respostas reais, sem
   pedido) — conferir rodapé, opções numeradas e pagamento oficial no aparelho.
2. `ALLOWLIST_FULL_TEST` com restaurante de teste: pedido na entrega + pedido Pix
   ponta a ponta (pedido aparece na operação pela regra do Fute).
3. Popular `metadata.paymentQuestion/paymentOptionOrder/savedAddress` no runtime
   (hoje o RuntimeService ainda não injeta — os defaults atuais seguem valendo).
4. Resolver as 3 falhas pré-existentes do matcher de "menu question" (W8/W9).
5. Só então ampliar a allowlist / RESTAURANT_WIDE.

## Pendências conhecidas

- Runtime ainda não injeta os metadados do bridge (pagamento configurado /
  endereço salvo) — implementado e testado na máquina; ligação no
  `WhatsAppTextOrderingRuntimeService` fica para a rodada de ativação.
- O retorno ao "menu principal" após `0` emite `MENU_RETURN`; a renderização do
  menu do recepcionista é do router (fora da máquina pura).
- 3 falhas pré-existentes de matcher (W8-D/N, W9-O) — UX, não segurança.
