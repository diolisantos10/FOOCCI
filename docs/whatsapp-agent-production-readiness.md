# WhatsApp Agent — Production Readiness

> Decisão operacional consolidada para a frente WhatsApp. Atualizado em
> 2026-06-17, branch `claude/remove-legacy-runner-q8iXa`. Complementa
> `docs/whatsapp-agent-current-raiox.md` (raio-x) e
> `docs/whatsapp-routing-raiox.md` (roteamento + Host Routing Diagnostic).
>
> A Foocci precisa **vender quando autorizado** (Text Order) e **receber com
> segurança quando não autorizado** (Recepcionista). Este doc diz, em um só
> lugar, se essa camada está pronta para manter allowlist, ampliar, ou pedir
> RESTAURANT_WIDE.

---

## 1. Os dois caminhos

| | Text Order | Recepcionista |
|---|---|---|
| Quando | `routingEligible && (sessão || intenção de pedido)` (allowlist + modo que responde) | todo o resto (fora da allowlist, saudação, FAQ, endereço solto) |
| Função | anota pedido, CEP→frete, Pix após resumo | recepciona, menu, FAQ, handoff |
| Cria pedido/Pix | **Sim** em `ALLOWLIST_FULL_TEST` (só allowlist) | **Nunca** |
| Risco | cobrança real para `…223` | nenhuma cobrança |

Estado de produção: `mode=ALLOWLIST_FULL_TEST`, `scope=PHONE_ALLOWLIST`,
allowlist = 1 número (`…223`), `RESTAURANT_WIDE=não`, kill-switch global=não.

---

## 2. Diagnósticos disponíveis (read-only, herméticos)

| Diagnóstico | Rota | Cobre |
|---|---|---|
| Routing | `/api/cron/whatsapp/text-order-routing-diagnostic` | elegibilidade config+telefone (Text Order) |
| **Host Routing** | `/api/cron/whatsapp/host-routing-diagnostic` | host + tipo de resposta do recepcionista |
| **Full Agent** | `/api/cron/whatsapp/full-agent-diagnostic` | bateria única dos 2 caminhos + decisão operacional |
| Simulator | `/api/cron/whatsapp/text-order-simulator` | jornada completa do Text Order (sintética) |
| Full-Test Readiness | `/api/cron/whatsapp/text-order-full-test-readiness` | config/segurança |

Todos: `noEvolution=true`, `noRealOrder=true`, `noRealPix=true`,
`runtimeTouched=false`, telefone mascarado.

---

## 3. Full Agent Diagnostic

`POST /api/cron/whatsapp/full-agent-diagnostic` (`CRON_SECRET`). Roda **11
cenários** em dois perfis (allowlisted self-test + sintético fora da allowlist),
avalia cada um (P0/P1/P2/OK) e emite **summary** + **recommendation**.

Cenários: saudação, pedido (yakisoba+coca, typo, rodízio+temakis), endereço
solto, handoff — no perfil allowlisted; pedido, rodízio, `tem temaki?`, endereço
solto, pedido explícito — no perfil non-allowlisted.

### Critérios de falha
- **P0:** pedido allowlisted não vira TEXT_ORDER; pedido non-allowlisted não vira
  SAFE_MENU; link gigante na 1ª resposta; endereço solto → LOCATION; handoff
  indevido; perfil incorreto; qualquer violação de segurança.
- **P1:** caso crítico cai no branch GPT (UNKNOWN — não-determinístico).
- **P2:** polimento.

### Workflow
`whatsapp-full-agent-diagnostic.yml` — falha o job se `p0>0` ou qualquer
`safety` violada.

---

## 4. Matriz de decisão operacional

| Condição | status | recommendation |
|---|---|---|
| Qualquer violação de segurança (Evolution/order/Pix/runtime) | FAIL | **ROLLBACK_OR_PAUSE** |
| `p0 > 0` (comportamental) | FAIL | **KEEP_ALLOWLIST** |
| `p1 > 0` | WARNING | **KEEP_ALLOWLIST** |
| `p0=0 && p1=0`, sem campo validado | PASS | **EXPAND_ALLOWLIST** |
| `p0=0 && p1=0`, campo validado + rollback documentados | PASS | **READY_FOR_RESTAURANT_WIDE_REQUEST** |

> O diagnóstico **nunca** abre nada automaticamente. `fieldValidated` só vai a
> `true` por decisão humana, com teste de campo controlado + rollback prontos.

---

## 5. Recomendação atual

**EXPAND_ALLOWLIST** (condicional a campo). A bateria hermética passa nos dois
caminhos (p0=0 esperado) e a segurança é garantida, mas **ainda falta a validação
de campo** com um número real fora da allowlist e um pedido real allowlisted de
ponta a ponta. Portanto: **manter `…223`** e, quando o time quiser, **adicionar
poucos números confiáveis à allowlist** (ação humana, com confirmação) para um
piloto controlado — **não** abrir RESTAURANT_WIDE ainda.

---

## 6. O que falta para abrir geral (RESTAURANT_WIDE)

1. `full-agent-diagnostic` PASS em produção com `p0=0 && p1=0`.
2. **Validação de campo** documentada: número real fora da allowlist (recebe
   SAFE_MENU, sem link/localização/handoff) + pedido real allowlisted completo
   (comanda → CEP → frete → Pix após resumo).
3. Rollback testado (ver §7).
4. Política de Pix/pedido real para escala decidida.
5. Cobertura do branch GPT do recepcionista (hoje UNKNOWN/não-determinístico) ou
   aceite explícito do risco.
6. Pedido formal de RESTAURANT_WIDE via Brain Director (não automático).

---

## 7. Rollback

- **Pausar:** `WhatsAppTextOrderingConfig.paused = true` (painel) ou
  `WHATSAPP_TEXT_ORDERING_PAUSED=true` (Railway, global). Efeito: nenhum telefone
  entra no Text Order; recepcionista assume tudo (sem cobrança).
- **Desligar:** `enabled=false` ou kill-switch global
  `WHATSAPP_TEXT_ORDERING_ENABLED=false`.
- **Rebaixar modo:** `ALLOWLIST_FULL_TEST → ALLOWLIST_REPLY_ONLY` (responde sem
  criar pedido/Pix) → `DRY_RUN_ONLY` (observa em silêncio).
- **Reduzir escopo:** nunca foi `RESTAURANT_WIDE`; `configRemediation` impede
  abertura automática e sempre rebaixa para `PHONE_ALLOWLIST`/`REPLY_ONLY`.

Nenhuma dessas ações é executada por diagnóstico — são manuais/painel.

---

## 8. Go-Live runbook — abrir para clientes finais (RESTAURANT_WIDE)

> Decisão do CEO/Diego: abrir o Text Order para clientes finais. A abertura é
> **config-only** (não envia WhatsApp, não cria pedido/Pix); pedido/Pix reais só
> acontecem **após a confirmação final do cliente**, no campo.

### Como abrir (gated)
1. Workflow **`whatsapp-text-order-open-restaurant-wide.yml`** (manual), inputs:
   - `confirm = OPEN_WHATSAPP_TEXT_ORDER_RESTAURANT_WIDE`
   - `acknowledge_real_customers = true`, `acknowledge_real_orders = true`, `acknowledge_real_pix = true`
2. A rota `POST /api/cron|admin/whatsapp/text-order/open-restaurant-wide` roda os
   **gates de promoção** (config risk ≠ HIGH, flow PASS p0=0, cockpit p0=0) e só
   abre se todos passarem. Resultado: `scope=RESTAURANT_WIDE`, `mode=ALLOWLIST_FULL_TEST`,
   `enabled=true`, `paused=false`. Registra Brain Director CR + audit em `notes`.
3. Se **qualquer** gate falhar → **não abre** e reporta o blocker.

> Nota de modo: não existe um modo `RESTAURANT_WIDE_FULL_PRODUCTION` separado.
> `ALLOWLIST_FULL_TEST` é o modo que cria pedido/Pix reais **somente após
> confirmação final**; com `scope=RESTAURANT_WIDE` ele passa a valer para **todos**
> os clientes. Esse é o "equivalente existente".

### Honestidade operacional (risco assumido)
O Full Agent Diagnostic recomenda **EXPAND_ALLOWLIST** porque a **validação de
campo** (cliente real fora da allowlist + pedido real allowlisted ponta-a-ponta)
**ainda não foi feita**. Abrir geral agora é uma decisão humana que **pula esse
gate**, aceitando o risco com monitoramento full-time + rollback de 30s. Pix/order
após confirmação final estão provados por testes unitários, **não** em campo.

## 9. Live monitoring (primeiras horas)

Monitor read-only (sem PII): **`GET /api/admin/whatsapp/text-order/live-status?restaurantSlug=sushi-cazza`**
→ última hora: `conversationsEnteredTextOrder`, `ordersCreated`, `pixGenerated`,
`handoffs`, `errors`, `unknownResponses`, + `lastErrors[]` (id interno + motivo, sem dados pessoais).

Checklist do Diego durante o go-live:
- [ ] conversas entrando no Text Order (sobe?)
- [ ] pedidos criados batem com pedidos reais recebidos
- [ ] Pix gerado só após o resumo/confirmação
- [ ] handoffs (cliente pediu atendente) aparecem na Central
- [ ] `errors`/`lastErrors` — investigar cada um
- [ ] mensagens estranhas/UNKNOWN → trazer print
- [ ] abandono no CEP / no Pix (olhar `lastErrors` + Central)

Onde olhar: live-status (números), Central de Atendimento (conversas/handoffs),
e os logs `[WhatsAppReceptionistService] sending-reply { responseType }` para o
caminho do recepcionista.

## 10. Fallback para atendente

Frases que disparam handoff (recepcionista **e** Text Order): `atendente`,
`falar com atendente`, `humano`, `quero falar com alguém`, `quero falar com ...`.
Efeito: conversa → HUMAN, IA para, mensagem clara, aparece na Central. (Coberto por
`detectIntent → HUMAN_REQUEST` no recepcionista e pelo handoff do Text Order.)

## 11. Rollback emergencial (30 segundos)

Workflow **`whatsapp-text-order-rollback.yml`** (ou `POST .../text-order/rollback`),
`confirm = ROLLBACK_WHATSAPP_TEXT_ORDER`. Aplica `paused=true` + `DRY_RUN_ONLY` +
`PHONE_ALLOWLIST`. Efeito imediato: Text Order para para clientes finais; o
recepcionista normal continua; allowlist/config/**histórico preservados**; nenhum
pedido é apagado.

## 12. Status final

- ✅ Os dois caminhos cobertos por diagnóstico hermético (Host + Full Agent).
- ✅ Máquina de abertura/rollback/monitoramento pronta e **gated** (config-only).
- ✅ Segurança garantida nos diagnósticos (sem Evolution/pedido/Pix/runtime).
- ⏳ **Validação de campo pendente** — o sistema recomenda EXPAND_ALLOWLIST; abrir
  geral é decisão humana que assume esse risco.
- 🔁 Rollback de 30s sempre disponível.
