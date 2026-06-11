# WhatsApp — Teste Controlado do Pedido por Texto (v1)

> Atualizado em 2026-06-11 (branch `claude/remove-legacy-runner-q8iXa`).
> Checklist operacional para validar o "anotador de pedido" do WhatsApp com
> telefone real do Diego/time, em duas fases: **REPLY_ONLY** (responde, não cria
> nada) e depois **FULL_TEST** (pedido/Pix reais, só allowlist).
> Restaurante do teste: **Sushi Cazza** (`restaurantSlug=sushi-cazza`).

## Regras de ouro

- **Nunca** ativar para todos os clientes (`RESTAURANT_WIDE` fora deste teste).
- **Nunca** adicionar à allowlist um telefone que não seja do time.
- FULL_TEST **só depois** do REPLY_ONLY aprovado no aparelho.
- Qualquer estranheza → **Rollback** (seção final, ~30 segundos).

---

## 0) Antes do teste

Rodar o diagnóstico de configuração (somente leitura — não altera nada):

- GitHub Actions → **WhatsApp Text Order Config Diagnostic** →
  `restaurant_slug=sushi-cazza` + telefone do Diego no campo `phone`
  (só vira booleano `phoneInAllowlist`/`savedAddress…`, nunca é logado).
- Ou direto: `POST /api/cron/whatsapp/text-order-config-diagnostic`
  (Bearer `CRON_SECRET`, body `{"restaurantSlug":"sushi-cazza","phone":"+55..."}`).

Conferir no resultado:

- [ ] `featureEnabled`, `paused`, `mode`, `allowlistCount` — estado atual real.
- [ ] `scope=PHONE_ALLOWLIST` — **`RESTAURANT_WIDE` deixa QUALQUER cliente real
      entrar no fluxo** (o diagnóstico marca `riskLevel=HIGH` nesse caso).
- [ ] `paymentOptionsEnabled=true` e quais formas (pix/cash/card) estão ligadas
      no PaymentSettings — a pergunta de pagamento do WhatsApp reflete SÓ essas.
- [ ] `sampleProductsAvailable > 0` (cardápio com itens ativos/disponíveis).
- [ ] `canRunReplyOnly` / `missingForReplyOnly` — o que falta configurar.
- [ ] `riskLevel=LOW` (nenhum cliente real entra: allowlist + modo controlam tudo).

Depois, ativar **somente para os telefones do teste** via admin
(`ADMIN_SECRET`, nunca pelo agente):

```
PATCH /api/admin/diagnostics/whatsapp-text-ordering/config?restaurantSlug=sushi-cazza
{ "enabled": true,
  "mode": "ALLOWLIST_REPLY_ONLY",
  "scope": "PHONE_ALLOWLIST",
  "allowlistedPhones": ["+55DDDXXXXXXXXX"],
  "paused": false }
```

- [ ] Conferir com `GET …/config?restaurantSlug=sushi-cazza` que voltou exatamente isso.
- [ ] Cliente real NÃO entra: com `scope=PHONE_ALLOWLIST`, qualquer telefone fora
      da allowlist segue no recepcionista normal — nenhum modo burla esse guard.

---

## 1) Fase REPLY_ONLY (responde, não cria pedido nem Pix)

Enviar do telefone allowlisted, na ordem. Em TODA resposta ativa conferir o
rodapé **`0. menu`** e que nada de pedido/Pix aparece na operação.

| # | Mensagem | O que validar |
|---|---|---|
| 1 | "Quero um yakisoba e uma coca, pagar em dinheiro na entrega" | Itens reconhecidos do cardápio real (ambiguidade → opções numeradas `1 — … — R$ …`); pagamento declarado é confirmado (`1. Sim / 2. Escolher outra`); dinheiro → pergunta **troco**; entrega → endereço (oferece o salvo `1. Sim / 2. Usar outro`); revisão final SEM criar pedido. |
| 2 | "1 temaki e 1 coca, retirada" | Fluxo de retirada (sem endereço/frete); pergunta de pagamento numerada refletindo o PaymentSettings; revisão final SEM pedido. |
| 3 | "Quero um combinado, vou pagar no Pix" | Pix pré-selecionado mas confirmado; **nenhum QR/link gerado** (REPLY_ONLY bloqueia `GENERATE_PIX`). |
| 4 | "Tem lasanha?" (item inexistente) | "Não encontrei" + alternativas reais — **nunca inventa item/preço**. |
| 5 | "0" no meio de uma comanda | Pergunta `1. Continuar pedido / 2. Descartar / 3. Falar com atendente` — nunca descarta sem confirmar. |
| 6 | "Quero falar com atendente" | Handoff humano imediato, sem rodapé (estado terminal); conversa segue com humano. |

Critérios de aprovação da fase:

- [ ] 6/6 cenários com resposta correta no aparelho.
- [ ] Zero pedidos criados, zero Pix gerados, zero itens/preços inventados.
- [ ] Rodapé `0. menu` em toda mensagem ativa.
- [ ] Recepcionista normal intacto para telefones fora da allowlist.

---

## 2) Fase FULL_TEST (só após REPLY_ONLY aprovado)

Subir o modo — mesmos telefones, mesma allowlist:

```
PATCH …/config?restaurantSlug=sushi-cazza
{ "mode": "ALLOWLIST_FULL_TEST" }
```

Validar ponta a ponta (com pedidos de valor baixo):

- [ ] **Pedido na entrega**: só é criado APÓS a confirmação final do cliente
      (`CREATE_ORDER` é a última ação do fluxo confirmado).
- [ ] **Dinheiro** → perguntou troco ("troco para quanto?") e o valor consta no pedido.
- [ ] **Pix** → QR/copia-e-cola gerado APÓS confirmar, pelo backend existente
      (`createPixPayment`/Mercado Pago) — e o pedido só aparece na operação
      seguindo a MESMA regra do Fute (pago/confirmado).
- [ ] Pedido aparece na **operação** no momento correto (não antes da confirmação;
      Pix segue a regra de pagamento do Fute).
- [ ] **Timeline clara**: dá para entender o que o cliente pediu, endereço,
      pagamento e total — como um pedido normal do Fute.
- [ ] **Humano assume**: "quero falar com atendente" durante FULL_TEST faz
      handoff sem criar nada pela metade.

---

## 3) Rollback (~30 segundos)

Na ordem de preferência — qualquer um deles para o fluxo na hora:

1. `PATCH …/config?restaurantSlug=sushi-cazza { "paused": true }` — pausa imediata.
2. Ou `{ "mode": "DRY_RUN_ONLY" }` — engine continua viva, mas não responde nem cria nada.
3. Ou `{ "allowlistedPhones": [] }` — ninguém entra no fluxo.
4. Emergência global (env, vale para todos os restaurantes):
   `WHATSAPP_TEXT_ORDERING_PAUSED=true` ou `WHATSAPP_TEXT_ORDERING_ENABLED=false`.
5. Em TODOS os casos o recepcionista normal do WhatsApp segue funcionando —
   nenhum cliente fica sem atendimento.

Pós-rollback: rodar de novo o **Config Diagnostic** e conferir
`canRunReplyOnly=false` / `paused=true` (estado seguro confirmado).

---

## 4) Correção rápida de exposição (`RESTAURANT_WIDE`)

Se o diagnóstico apontar `scope=RESTAURANT_WIDE` com `riskLevel=HIGH` (cliente
real entrando sem validação), rodar o workflow **WhatsApp Text Order Secure
Scope** (`restaurant_slug=sushi-cazza`, opcional `add_phone`). Ele só REDUZ
exposição: força `PHONE_ALLOWLIST`, rebaixa o modo para `ALLOWLIST_REPLY_ONLY`,
preserva a allowlist. Nunca abre `RESTAURANT_WIDE`, nunca liga `FULL_TEST`, nunca
envia/cria pedido/Pix. Endpoint: `POST /api/cron/whatsapp/text-order-secure-scope`.

## 5) Critérios para liberar `RESTAURANT_WIDE`

Só liberar (e exige o marcador `[RW_APPROVED]` no `notes` da config) quando TODOS:

- [ ] W8/W9 matcher corrigido (pergunta de cardápio não vira "produto inexistente").
- [ ] REPLY_ONLY validado no aparelho.
- [ ] FULL_TEST validado ponta a ponta (pedido + Pix).
- [ ] Quality P0=0 e Flow Diagnostic PASS.
- [ ] Config Diagnostic `riskLevel` ≠ HIGH.
- [ ] Change request do Brain Director aprovado.
- [ ] Rollback documentado (seção 3).

Conferência única: **Readiness Diagnostic**
(`POST /api/cron/whatsapp/text-order-readiness`) → `restaurantWideReady=true`.
