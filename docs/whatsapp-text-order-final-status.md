# WhatsApp Text Order — Status Final da Frente (Production Closure v1)

> Branch `claude/remove-legacy-runner-q8iXa` · 2026-06-11.
> Encerramento da primeira frente: WhatsApp como **recepcionista + anotador de
> pedido por texto**, com simulação, FULL_TEST controlado, governança, rollback
> e caminho seguro para produção geral. **Fechar ≠ abrir sem controle.**

## 1. O que o WhatsApp faz agora

Recepcionista (fluxo atual intacto) **+** anotador de pedido por texto: entende
texto livre, consulta o cardápio real, resolve ambiguidade com opções numeradas,
monta comanda, confirma entrega/endereço/pagamento e fecha **pelo mesmo backend
do Fute** (pedido `createOrderRecord`, Pix `createPixPayment`, PaymentSettings,
endereço salvo). Nada finaliza sem confirmação.

## 2. Recepcionista vs anotador

- **Recepcionista**: menu de opções, links, horários, handoff — sempre ativo.
- **Anotador** (`WhatsAppTextOrderingRuntimeService` + máquina pura): só entra
  pelo gating (enabled + modo + allowlist); quem está fora cai no recepcionista.

## 3–7. Pedido livre · pagamento · Pix · endereço salvo · `0. menu`

Ver `docs/whatsapp-text-order-flow.md` (fluxo completo). Resumo: `ORDER_BY_TEXT`
→ comanda → entrega/retirada → endereço (oferece o salvo) → pagamento oficial
numerado (PaymentSettings; dinheiro pergunta troco) → revisão → confirmação →
`CREATE_ORDER`(+`GENERATE_PIX`). Toda mensagem ativa termina com **`0. menu`**;
`0` com comanda pergunta continuar/descartar/atendente.

## 8. Cockpit (WA Cockpit)

`/admin/agents/whatsapp` — validação principal **sem celular**: simulação completa
(transcript + comanda + ações traduzidas `WOULD_CREATE_ORDER`/`WOULD_GENERATE_PIX`
+ safety flags), checklist de 8 itens, decisão do operador, config & readiness.
Ver `docs/whatsapp-text-order-simulator.md`.

## 9. Treinamento IA

O Treinamento IA (`/admin/agentes/training`) é o loop 24h (captura → simula →
avalia → propõe → aprovação humana → sandbox). O WhatsApp agora aparece lá como
**arena externa**: card "WhatsApp · Pedido por Texto" na aba Arena, apontando para
o WA Cockpit — *"Arena segura para validar o anotador de pedido sem enviar
WhatsApp, sem criar pedido e sem gerar Pix."* (link, sem duplicar lógica).
Raio-x completo: `docs/ai-training-admin-raiox.md`.

## 10. FULL_TEST controlado (como funciona)

- **Pré-prova sem celular:** `POST /api/cron/whatsapp/text-order-full-test-readiness`
  (workflow `whatsapp-text-order-full-test-readiness.yml`) — prova hermética de que
  pedido/Pix só viriam após confirmação, REPLY_ONLY não cria, FULL_TEST exige
  allowlist, `0. menu`/handoff intactos, rollback pronto.
- **Promoção governada:** `POST /api/admin/whatsapp/text-order/promote-full-test`
  com `confirm: "PROMOTE_WHATSAPP_TEXT_ORDER_FULL_TEST"`. Gates obrigatórios:
  PHONE_ALLOWLIST + allowlist>0 + feature viva + risco ≠ HIGH + Flow Diagnostic
  PASS + Cockpit PASS. Só muda config (força `scope=PHONE_ALLOWLIST`), grava
  auditoria no `notes`, `runtimeTouched=false`. Qualquer gate reprovado → não
  promove e lista os bloqueios.

## 11. RESTAURANT_WIDE (como funciona)

**Nunca abre por força bruta.** Caminho único:
1. FULL_TEST controlado validado (modo atual = ALLOWLIST_FULL_TEST + gates PASS);
2. `POST /api/admin/whatsapp/text-order/request-restaurant-wide`
   (`confirm: "REQUEST_WHATSAPP_TEXT_ORDER_RESTAURANT_WIDE"`) → cria
   **BrainChangeRequest** `PENDING_APPROVAL` (target `AGENT_POLICY`,
   `runtimeImpact=PRODUCTION` ⇒ `riskLevel=CRITICAL` + `requiresQualityGate=true`),
   com relatório do Cockpit e plano de rollback anexados; grava
   `[RW_REQUESTED:<id>]` no notes. **Não muda o scope.**
3. Humano aprova a CR no Brain Director (`/admin/brain`) + quality gate;
4. Só então: marcar `[RW_APPROVED]` no notes + trocar o scope deliberadamente no
   admin. Sem o marcador, RESTAURANT_WIDE vivo = `riskLevel=HIGH` no diagnóstico.

## 12. Rollback (30 segundos)

`POST /api/admin/whatsapp/text-order/rollback` com
`confirm: "ROLLBACK_WHATSAPP_TEXT_ORDER"` → `paused=true` + `mode=DRY_RUN_ONLY` +
`scope=PHONE_ALLOWLIST`. Preserva allowlist, config e TODO o histórico; bloqueia
FULL_TEST e RESTAURANT_WIDE; o recepcionista normal segue atendendo. Alternativas:
PATCH admin `{paused:true}` ou env `WHATSAPP_TEXT_ORDERING_PAUSED=true`.

## 13. O que está LIBERADO

- ✅ REPLY_ONLY em produção para a allowlist (Sushi Cazza: PHONE_ALLOWLIST, LOW).
- ✅ Validação completa sem celular (Cockpit + 5 diagnósticos + workflows).
- ✅ Promoção governada para FULL_TEST controlado (1 chamada admin com confirm).
- ✅ Rollback de 30s.
- ✅ Pedido/Pix reais SOMENTE em FULL_TEST, só allowlist, só após confirmação.

## 14. O que continua BLOQUEADO

- ❌ RESTAURANT_WIDE — exige BrainChangeRequest aprovada + quality gate +
  `[RW_APPROVED]` + troca deliberada de scope (4 passos humanos).
- ❌ FULL_TEST sem allowlist — impossível por construção (`modePermissions` +
  guard de telefone antes de tudo).
- ❌ Qualquer envio/pedido/Pix em diagnóstico/simulação/teste.
- ❌ Promoção sem gates ou sem confirm explícito.

## Estado validado em produção (fechamento)

Ver execuções dos workflows: Config Diagnostic, Flow Diagnostic (PASS 18/18),
Readiness (`replyOnlyReady=true`, LOW), Simulator (PASS 11/11, p0=0) e
FULL_TEST Readiness — todos com `noSend/noRealOrder/noRealPix` e
`runtimeTouched=false`.
