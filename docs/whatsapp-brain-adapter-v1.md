# WhatsApp Brain Adapter v1 + Política de Retorno da IA

> Implementado em 2026-06-10 no branch `claude/remove-legacy-runner-q8iXa`.
> **Camada cognitiva segura:** o WhatsApp Agent passa a poder consumir o Foocci
> Brain para raciocinar — **sem** enviar mensagem, chamar Evolution, criar pedido,
> gerar Pix ou tocar o runtime. O webhook real **não consome** o adapter nesta
> rodada (shadow/off por padrão).

## Por que

O raio-x (`docs/whatsapp-agent-current-raiox.md`) confirmou: o WhatsApp Agent
**não usava o Brain** (zero imports), classificava intenção com lógica própria, e
a IA **só voltava manualmente** após handoff — cliente podia ficar preso no humano
indefinidamente. Esta rodada conecta o WhatsApp ao Brain como **consumidor
cognitivo** e cria a **política de retorno da IA** (pura, só elegibilidade).

## WhatsApp Brain Adapter (`src/services/whatsapp/brain/`)

- `whatsappIntentGuardrails.ts` — detecção determinística de intenção, **em cima
  dos guardrails do Brain** (reusa `detectGuardrailIntent`). O guardrail de
  **pagamento/benefício** do Brain é checado **primeiro**, então
  Alelo/VR/Sodexo/ticket/vale-refeição/cartão/pix/dinheiro → PAYMENT/PAYMENT_BENEFIT
  — **nunca** "indecisão" nem recomendação de prato. Regras WhatsApp adicionais:
  atendente, reclamação, elogio, horário, cardápio, pedido.
- `WhatsAppBrainReasoningAdapter.ts` — `reasonWhatsAppMessage(req)` → resultado
  estruturado: `primaryIntent`, `confidence`, `recommendedAction`
  (SEND_ORDER_LINK | ANSWER_BASIC_INFO | HANDOFF_TO_HUMAN | KEEP_AI | NO_REPLY |
  ASK_CLARIFYING_QUESTION), `shouldHandoff`+`handoffReason`, `shouldSendOrderLink`,
  `safeReplyStrategy`, `contextUsed`/`missingContext`, `safetyNotes`,
  `runtimeTouched:false`. **Puro** (sem DB, sem LLM) → hermético e cron-friendly.
- Config segura (não consumida pelo webhook em v1):
  `WHATSAPP_BRAIN_ADAPTER_ENABLED=false`, `WHATSAPP_BRAIN_SHADOW_MODE=true`.

### Intents suportadas

START_ORDER · ASK_MENU · ASK_HOURS · PAYMENT_QUESTION · PAYMENT_BENEFIT_QUESTION ·
ASK_DELIVERY · ASK_ATTENDANT · COMPLAINT · PRAISE · UNCLEAR · OTHER.

### Recepcionar × vender

O adapter mantém o princípio do raio-x: o WhatsApp **recepciona e conduz**
(SEND_ORDER_LINK leva ao `/pedido`); a **venda consultiva** continua no Waiter em
`/pedido`. O adapter decide *para onde conduzir*, não vende no chat.

## Política de Retorno da IA (`WhatsAppAiReturnPolicy.ts`)

`evaluateAiReturn(input)` — função **pura** que só calcula elegibilidade (não
altera `aiEnabled`, não envia, não toca runtime). Regras:

1. `aiLocked=true` → **LOCKED** (nunca volta).
2. `conversationType ≠ CUSTOMER` → **LOCKED**.
3. status não-humano → **NOT_HUMAN**.
4. último handoff CRITICAL/COMPLAINT → **CRITICAL_HANDOFF** (operador precisa fechar).
5. cliente reabriu após silêncio ≥12h → **CUSTOMER_REOPENED** (elegível).
6. ≥12h de inatividade humana → **INACTIVITY_12H** (elegível).
7. novo dia operacional (BRT) sem atividade recente → **NEW_DAY** (elegível).
8. caso contrário → **RECENT_HUMAN_ACTIVITY** (bloqueado).

`shouldReturnToAi=true` apenas para NEW_DAY/INACTIVITY_12H/CUSTOMER_REOPENED.
**Não executa o retorno** nesta rodada — só torna elegível. (Agir nisso, e gravar
um evento `[ai_return:auto_timeout]` na timeline, é um passo governado futuro.)

## Diagnósticos cron-safe

- `POST /api/cron/whatsapp/brain-diagnostic` (Bearer CRON_SECRET) — roda os 6 casos
  sintéticos (Alelo / pedido / horário / atendente / entrega / reclamação) pelo
  adapter e prova `status=PASS`, `p0=0`, `noSend`/`noEvolution`/`noOrder`/`noPix`,
  `runtimeTouched=false`. **Não lê o banco, não envia nada.**
- `POST /api/cron/whatsapp/ai-return-diagnostic` (Bearer CRON_SECRET) — lê
  conversas em HUMAN **somente leitura**, calcula com a política quantas seriam
  elegíveis e por que as outras estão bloqueadas (lock / humano recente / handoff
  crítico). **Não altera nada.**

## O que ainda NÃO está ativo

- O webhook real **não** chama o adapter (shadow/off). Nenhuma decisão real do
  WhatsApp passou a depender do Brain ainda.
- O retorno automático da IA **não** é executado — só diagnosticado.
- Trocar isso para ativo exige: ligar a flag, validar em shadow, e (para mudança
  estrutural) um Change Request no Brain Director.

## Como validar

`vitest src/services/whatsapp/brain` (14 testes) · diagnóstico cron
`brain-diagnostic` (PASS, p0=0) · `ai-return-diagnostic` (read-only).

## Riscos restantes

- WhatsApp ainda roda no fluxo antigo de produção (adapter em shadow) — P1 até a
  ativação validada.
- Retorno automático ainda não executado — o P1 "cliente preso no humano" fica
  **diagnosticável**, mas só resolve quando o passo de execução governado existir.
- Dedupe de OUTBOUND, waToken em querystring e as 3 falhas de matcher W8/W9
  permanecem (fora do escopo desta rodada).
