# WhatsApp — Simulador do Pedido por Texto

> Atualizado em 2026-06-11 (branch `claude/remove-legacy-runner-q8iXa`).
> O simulador prova o **anotador de pedido por texto** ponta a ponta **sem
> celular, sem enviar WhatsApp e sem criar pedido/Pix real**. É a primeira etapa
> de validação — o Diego não precisa testar manualmente no aparelho para saber
> se a arquitetura está funcionando.

## Onde fica

- **Cockpit admin:** `/admin/agents/whatsapp` (menu lateral: **WA Cockpit**).
  Um botão "Rodar simulação completa" + modo simulado + slug do restaurante.
- **Test Center / Simulador manual (turn a turn):**
  `/admin/diagnostics/whatsapp-text-ordering` e `.../simulator` (já existentes).
- **Cron-safe (CI/produção, sem ADMIN_SECRET):**
  `POST /api/cron/whatsapp/text-order-simulator` (Bearer `CRON_SECRET`).
  Workflow manual: `.github/workflows/whatsapp-text-order-simulator.yml`.
- **Admin (one-click):** `POST /api/admin/diagnostics/whatsapp-text-ordering/simulator/full`.

## O que ele testa

Roda a **máquina de estado real** sobre um **cardápio sintético** + **PaymentSettings
sintético** + **endereço salvo sintético**, com `allowSideEffects=false`. Cenários:

1. **Texto livre — detecção/extração:** "Quero um yakisoba de frango e uma coca.
   Vou pagar em dinheiro na entrega." → detecta `ORDER_BY_TEXT`, extrai itens +
   `paymentMentioned=dinheiro` + `deliveryMentioned=entrega`.
2. **Dinheiro + entrega + endereço salvo:** oferece o endereço salvo, pergunta
   troco e sinaliza `WOULD_CREATE_ORDER`.
3. **Pix:** retirada → `WOULD_CREATE_ORDER` + `WOULD_GENERATE_PIX` (só após o
   resumo); Pix em simulação é stub, nunca real.
4. **Retirada:** não pede endereço, vai para pagamento.
5. **Produto inexistente:** não inventa; oferece confirmar/cardápio/atendente.
6. **Produto ambíguo:** lista opções numeradas; não escolhe sozinho.
7. **`0` com comanda:** pergunta continuar/descartar/atendente.
8. **Atendente:** handoff, sem criar pedido.
9. **Perguntas de cardápio (W8/W9):** não cita a frase entre aspas como produto.
10. **Config perigosa / segura:** `RESTAURANT_WIDE` sem aprovação → `riskLevel=HIGH`
    e bloqueia; `PHONE_ALLOWLIST` + `REPLY_ONLY` → `LOW` e replyOnly pronto.

## Como interpretar PASS / WARNING / FAIL

- **PASS** — todas as verificações passaram.
- **WARNING** — alguma verificação P1/P2 falhou (ajuste de UX), nada de segurança.
- **FAIL** — uma verificação **P0** falhou. P0 cobre segurança e invariantes:
  não criar pedido/Pix real, não inventar produto, não citar pergunta como produto,
  detectar intenção, fazer handoff. **FAIL bloqueia** (workflow sai com erro).

## Transcript e comanda

Cada cenário de fluxo traz o **transcript** completo (`CUSTOMER` / `AGENT` /
`SYSTEM`) — exatamente o que o cliente veria, incluindo o rodapé `0. menu`. A
**comanda** (`orderDraft`) mostra itens, taxa e total que seriam montados. As
**ações** mostram `WOULD_CREATE_ORDER` / `WOULD_GENERATE_PIX` quando o fluxo
chegaria a criar pedido/Pix — sem nada real acontecer.

## Como ver se criaria pedido/Pix

Pelo campo `actions` de cada cenário: `WOULD_CREATE_ORDER` e/ou
`WOULD_GENERATE_PIX`. O bloco **Segurança** confirma `noEvolution`,
`noRealOrder`, `noRealPix`, `runtimeTouched=false`.

## Como validar config e readiness

O cockpit também mostra, para o restaurante informado, o **Config & Readiness**:
`scope`, `mode`, `allowlistCount`, `riskLevel`, `replyOnly/fullTest/restaurantWide
Ready`, bloqueios, avisos, próximas ações e os passos de rollback. Fonte:
`POST /api/admin/diagnostics/whatsapp-text-ordering/readiness` (admin) ou
`POST /api/cron/whatsapp/text-order-readiness` (cron).

## Por que o Diego não precisa testar manualmente primeiro

A simulação roda a **mesma máquina** que o runtime real usa, com o **mesmo
backend** do Fute (pagamento/endereço/pedido/Pix), apenas com dados sintéticos e
sem efeitos colaterais. Se o simulador está **PASS / p0=0**, a arquitetura está
funcionando: o teste no aparelho vira só uma conferência final, não o primeiro
diagnóstico.
