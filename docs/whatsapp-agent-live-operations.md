# WhatsApp Agent — Live Operations (produção assistida)

> Operação do WhatsApp Agent **enquanto roda como canal de venda ativo**. Foco:
> responder com raciocínio de atendimento/vendas, monitorar ao vivo e aprender
> com conversas reais — **sem parar vendas**. Branch: `claude/remove-legacy-runner-q8iXa`.
> Complementa `docs/whatsapp-live-learning.md` e `docs/whatsapp-agent-production-readiness.md`.

---

## 1. Premissa

O WhatsApp não é mais laboratório. `RESTAURANT_WIDE` ativo, `ALLOWLIST_FULL_TEST`
ativo. A estabilização é por **melhoria de comportamento + handoff + monitoramento**,
nunca por desligar. Nada é aplicado em produção sem aprovação humana.

---

## 2. Comportamento de vendas (raciocínio, não régua)

O recepcionista (`WhatsAppReceptionistService`) deve: entender o que o cliente
quer → responder a pergunta real → conduzir para o próximo passo da venda →
evitar respostas robóticas/links soltos/loops → chamar humano quando necessário.

Correções P0/P1 já aplicadas (com testes):

| Situação | Antes | Agora |
|---|---|---|
| "aceita Pix?" / "qual forma de pagamento?" | mandava link do cardápio (LINK_CARDAPIO) | responde a forma (method-aware) e conduz: "Sim, aceitamos Pix 😊 Quer fazer seu pedido agora?" — `buildPaymentInfoReply` |
| "aceita cartão?" | "Aceitamos Pix" genérico | "Sim, aceitamos cartão 😊 …" |
| endereço solto ("Rua X, 60") | localização do restaurante / handoff | orienta começar o pedido (CEP no passo certo) — `buildLooseAddressReply` |
| pedido explícito ("quero 2 temakis") | link como 1ª resposta | conduz com opções numeradas — `buildOrderIntentReply` |
| rodízio fora de sessão | link/derive errado | SAFE_MENU conduzido, sem delivery automático |
| loop (mesma resposta 2x) | repetia | quebra de loop + handoff (`isRepeatedClarificationLoop`) |

`PAYMENT_INFO` agora é **method-aware** (Pix / cartão / dinheiro / genérico) e
**nunca** retorna um link como corpo principal (evita classificação `LINK_CARDAPIO`,
que é P0).

---

## 3. Monitor ao vivo

- **Saúde (gestor):** Central de Aprendizado WhatsApp → aba **Saúde do WhatsApp**.
- **Admin/endpoint:** `GET /api/admin/whatsapp/live-monitor?restaurantSlug=sushi-cazza&period=24h`.
- **Operacional (ordering):** `GET /api/admin/whatsapp/text-order/live-status` (última hora).

Métricas: conversas (24h), pedidos gerados, receita atribuída (`Order.source="whatsapp"`),
conversa→pedido, handoffs, abandonos, erros por categoria (+ top 5), aprendizados
pendentes. **Read-only, sem PII, sem envio.**

---

## 4. Aprendizado diário

Workflow `whatsapp-live-learning-review.yml` (cron diário + manual). Lê conversas
reais, gera aprendizados, **deduplica** e enfileira para aprovação. Modo `dryRun`
para conferir sem gravar. Ver `docs/whatsapp-live-learning.md`.

---

## 5. Handoff e fallback

Frases de handoff (`atendente`, `falar com atendente`, `humano`, …) levam a
conversa para HUMAN e param a IA. Em baixa confiança / loop, a IA escala em vez
de insistir. Reclamações e status de pedido também escalam.

---

## 6. Diagnósticos (read-only, herméticos)

- Full Agent Diagnostic — `POST /api/cron/whatsapp/full-agent-diagnostic`
  (RESTAURANT_WIDE-aware; sessão ativa no número de auto-teste vira P2 inconclusivo,
  não P0). Último resultado em produção: **PASS · p0=0 · EXPAND_ALLOWLIST**.
- Host Routing — `POST /api/cron/whatsapp/host-routing-diagnostic`.
- Config — `POST /api/cron/whatsapp/text-order-config-diagnostic`.

Todos: `noEvolution / noRealOrder / noRealPix = true`, `runtimeTouched = false`.

---

## 7. Segurança operacional

- Nunca pausar o WhatsApp, nunca voltar para allowlist, nunca remover
  RESTAURANT_WIDE, nunca desligar FULL_TEST como "correção".
- Correção é por comportamento + handoff + monitoramento.
- Aprendizados só entram na produção via aprovação humana + gates existentes.
- PII sempre mascarada; nenhum diagnóstico/rotina envia WhatsApp ou cria pedido/Pix.

---

## 8. Rollback de emergência

Inalterado: `whatsapp-text-order-rollback.yml` (`confirm =
ROLLBACK_WHATSAPP_TEXT_ORDER`) aplica `paused=true` + `DRY_RUN_ONLY` +
`PHONE_ALLOWLIST`. Histórico/config preservados. Decisão manual.
