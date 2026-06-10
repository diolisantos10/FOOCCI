# WhatsApp Agent — Raio-X da Arquitetura Atual

> Auditoria read-only realizada em 2026-06-10 no branch `claude/remove-legacy-runner-q8iXa`.
> Nenhum código foi alterado nesta rodada. Fotografia fiel de como o WhatsApp Agent
> roda hoje, para alinhar antes de conectá-lo ao Foocci Brain.

## 1. Visão geral

O WhatsApp Agent é a **porta de entrada operacional** do restaurante. Hoje ele é,
na prática, dois sub-fluxos sob o mesmo webhook:

- **Recepcionista (default):** `WhatsAppReceptionistService` — saudação, menu,
  intenção, handoff humano, link para `/pedido`. **Recepciona; não conduz venda.**
- **Pedido por texto (experimental, allowlist):** `services/whatsapp/ordering/*`
  — máquina de estados que monta pedido e (em modo FULL_TEST) cria pedido/Pix.

Ele **ainda não é um Department conectado ao Foocci Brain** (nenhum import de
`services/brain`).

## 2. Arquitetura atual (arquivos principais)

| Camada | Arquivo |
|---|---|
| Webhook Evolution | `src/app/api/webhooks/evolution/route.ts` |
| Parser/Processor | `src/services/evolution/WebhookParserService.ts` · `WebhookProcessorService.ts` |
| Recepcionista (IA) | `src/services/ai/WhatsAppReceptionistService.ts` |
| Política IA vs humano | `src/services/conversation/ConversationAiPolicyService.ts` · `src/lib/handoff.ts` |
| Pedido por texto | `src/services/whatsapp/ordering/` (StateMachine, RuntimeService, OrderCreation, Payment, Session, DraftBuilder, parser, menuMatcher…) |
| Config | `WhatsAppAgentConfigService.ts` · `ordering/WhatsAppTextOrderingConfigService.ts` · `EvolutionConfigService.ts` |
| Roteamento | `src/services/whatsapp/WhatsAppRoutingClassifier.ts` |
| Envio Evolution | `src/lib/evolution/EvolutionClient.ts` (`sendTextMessage`) |
| Identidade → pedido | `src/lib/wa-token.ts` · `src/app/api/pedido/[slug]/whatsapp-session/route.ts` · `src/app/pedido/[slug]/page.tsx` |
| Quality | `src/services/quality/auditors/WhatsAppAuditor.ts` + suites `whatsapp/ordering/tests/*` |

## 3. Fluxo da mensagem

```
Cliente no WhatsApp
 → Evolution webhook → POST /api/webhooks/evolution/route.ts
   (resolve instance → restaurantId; verifica HMAC/secret; loga evento)
 → WebhookParserService.parse() → WebhookProcessorService.process()
   • idempotência por externalMessageId (pula duplicado)
   • upsert Customer (nome via pushName)
   • resolve Conversation (reabre RESOLVED < 24h; senão nova)
   • cria Message (+ unreadCount) atômico
   • opt-out LGPD (STOP/SAIR/PARAR)
   • shouldAiRespond()  ← decide IA vs humano
 → roteamento por agentMode:
     AI_ORDERING_EXPERIMENTAL → AIOrderService.processTurn()
     default                  → WhatsAppReceptionistService.respond() (fire-and-forget)
 → resposta via EvolutionClient.sendTextMessage() (OUTBOUND, senderType=AI)
 → timeline: Message INBOUND/OUTBOUND + mensagens SYSTEM ([handoff:reason])
```

**Tabelas:** `Conversation`, `Message`, `Customer`, `WhatsAppOrderingSession`,
`Order`/`Payment` (só em FULL_TEST), `EvolutionConfig`/`WhatsAppAgentConfig`.
**Campos que controlam IA/humano:** `Conversation.aiEnabled` (temporário),
`Conversation.status` (OPEN/BOT/AI_ATENDENDO/HUMAN/RESOLVED), `Conversation.aiLocked`
(permanente), `Conversation.conversationType` (não-CUSTOMER ⇒ lock).
**Mensagens automáticas:** saudação/menu, fora-de-horário (`buildClosedMessage`),
pausa de pedidos, confirmação de handoff.

## 4. Relação com o Waiter

- O recepcionista **monta o link `/pedido`** identificado (waToken) e direciona —
  ele **não usa o WaiterBrainV2** nem conduz a venda no chat.
- A venda consultiva real é do **Waiter em `/pedido`** (web). O ordering por texto
  é um **segundo caminho separado** (allowlist/experimental), com sua própria
  máquina de estados — **não compartilha o WaiterBrainV2**.
- **Respostas (Parte 3):** O WhatsApp Agent **recepciona** (não vende). O Waiter
  **vende** (em `/pedido`). Quem conduz pedido hoje: o Waiter no `/pedido`, OU a
  máquina de estados do ordering por texto (só allowlist). Handoff: decidido pelo
  recepcionista (`markConversationNeedsHuman`). Link: decidido pelo recepcionista.
- **Duplicação:** há sobreposição conceitual (dois "cérebros" de venda — Waiter web
  e ordering por texto), porém isolados por modo. Risco P1 de divergência de
  comportamento/voz entre os dois.

## 5. Atendimento humano / handoff

- **Humano assume:** `markConversationNeedsHuman()` (`src/lib/handoff.ts`) seta
  atomicamente `status=HUMAN` + `aiEnabled=false` e grava `[handoff:reason]`.
  Disparado em intenções COMPLAINT/HUMAN_REQUEST/ORDER_STATUS e opção de menu
  "falar com atendente".
- **Cliente sabe que saiu da IA?** Sim — mensagem do tipo "Vou deixar nossa equipe
  te atender…".
- **IA volta quando?** **Só manualmente** (`unlockAiForConversation`). **Não há
  retorno automático** — nem por novo dia, nem por 12h de inatividade. Reabertura de
  RESOLVED < 24h volta a `OPEN` mas **não reativa IA** se estava em HUMAN.
- **Riscos:** (a) IA responder junto com humano — mitigado por checagem prévia de
  `aiEnabled`/`status` + idempotência, mas **sem lock transacional** (race possível);
  (b) **cliente preso no humano indefinidamente** — `aiEnabled=false` persiste sem
  timeout/job de expiração (P1 alto).

## 6. Fora do horário

- Detecção via `business-hours` (`isCurrentlyOpen`); `buildClosedMessage` informa o
  **próximo horário de abertura** e mostra menu filtrado (esconde "Falar com
  atendente" enquanto fechado).
- **Avisa claramente fora do horário?** Sim. **Botão atendente some fechado?** Sim
  (filtrado). **Cliente pede fora do horário?** Pelo recepcionista, não; o ordering
  por texto respeita config/pausa; o link `/pedido` em si depende das regras do
  Waiter/web. **Salão vs delivery:** o ordering coleta tipo (entrega/retirada) na
  máquina de estados; o recepcionista não diferencia além do menu.
- **Bugs conhecidos:** o matcher de "menu question" cita a frase do cliente como
  produto inexistente (ver Parte 8) — atrito de UX, não fora-de-horário.

## 7. Identificação WhatsApp → pedido

- **waToken** (`src/lib/wa-token.ts`): `base64url(payload).hmacSHA256`, payload
  `{phone, name?, exp}`, segredo `NEXTAUTH_SECRET`/`APP_SECRET`, **TTL 7 dias**,
  comparação timing-safe.
- Link: `?waToken=<token>&src=whatsapp`. `/pedido` (SSR) verifica e resolve telefone;
  fallback API `/api/pedido/[slug]/whatsapp-session` (rate-limit 20/60s/IP).
- **Leva identificado?** Sim, na maioria. **Quebra quando:** segredo rotacionado,
  token > 7 dias, segredo ausente em dev (cai para link sem assinatura `?src=whatsapp`).
  **Digita telefone de novo?** Só se o token quebrar. **Endereço reaproveitado?** O
  token carrega telefone+nome, **não endereço** (endereço vem do cadastro do cliente
  por telefone). **Token expira correto?** Sim (checa `exp`).
- **Risco privacy/security:** telefone+nome trafegam em querystring (histórico do
  navegador, logs/referrer); TTL de 7 dias é longo para link encaminhável (replay).
  P1.

## 8. Evolution API

- **Onde é chamada:** `EvolutionClient.sendTextMessage()` →
  `POST /message/sendText/{instance}`. Config (baseUrl/apiKey) **por restaurante no
  banco** (`EvolutionConfig`, criptografado com `ENCRYPTION_KEY`) — **sem env global**
  de URL/chave. Webhook usa `webhookSecret` por restaurante.
- **Impedir envio em teste:** gating por **modo** do ordering — `DRY_RUN_ONLY`
  (não envia), `ALLOWLIST_REPLY_ONLY` (responde, sem pedido/Pix), `ALLOWLIST_FULL_TEST`
  (responde + cria pedido + Pix). Kill-switches globais
  `WHATSAPP_TEXT_ORDERING_ENABLED/PAUSED` + allowlist de telefone.
- **Erros:** try/catch com log; **sem retry, sem fila** (fire-and-forget). **Risco de
  duplicar:** MÉDIO — o envio fica **fora da transação** do `Message.create`; webhook
  duplicado ⇒ duplo envio (idempotência depende da Evolution/WhatsApp, não há dedupe
  de OUTBOUND no app).

## 9. Quality / Testes do WhatsApp

- **WhatsAppAuditor** (em `runAll` do Quality): camada de **segurança** (no-send /
  no-Evolution / no-order / no-Pix) é dona do P0 — passa ⇒ PASS/INFO. Falhas
  **funcionais** de cenário ⇒ **WARNING/P1**, não P0. Crash do runner ⇒ FAIL/P0.
- **Suíte Quality:** 130 passed (verde) — o auditor está **P0 = 0**.
- **Suítes standalone do ordering (W8/W9):** **3 falhas pré-existentes** (não
  causadas por esta rodada — nenhum código foi tocado):
  - `W8 — D` e `W9-O` / `W8 — N`: o matcher responde *"Não encontrei \"yakisoba
    vegetariano\" no cardápio"* citando a frase inteira do cliente como produto
    inexistente quando era uma **pergunta de cardápio**.
  - **Bug real ou lacuna de matcher?** **Lacuna de matcher/UX** — não há efeito de
    segurança (nada envia/pede/Pix). Classificação P1/P2.
- **Fluxos não cobertos:** retorno automático da IA (inexistente), lock concorrente
  IA+humano, dedupe de OUTBOUND, simulação WhatsApp end-to-end estilo Waiter Sim Lab.
- **Auditor toca runtime real?** Não (read-only, quoter injetado, sem DB para
  pagamento/Pix). **P0 atual: 0.**

## 10. Relação com o Foocci Brain

**O WhatsApp Agent já é consumidor do Foocci Brain? NÃO.** Zero imports de
`services/brain`. Ele tem lógica própria de intenção (`WhatsAppRoutingClassifier`,
intents do recepcionista) que **não passa** pela Reasoning Layer, guardrails,
coherence validator, Knowledge Base, Director, Quality Gate ou Evidence do Brain.

**O que falta (WhatsApp Brain Adapter v1):** um adapter espelhando o
`WaiterBrainReasoningAdapter` — `BrainReasoningRequest` (sanitizedInput =
mensagem do cliente) → reasoning (guardrails + contexto + coerência) →
`BrainReasoningResult` para **classificar a intenção e decidir o próximo passo**,
sem tocar o runtime de envio.

**Decisões que deveriam passar pelo Brain:** cliente quer pedido; quer atendente;
pergunta horário; pergunta pagamento (o guardrail já resolve Alelo/VR!); reclama;
está fora do horário; está voltando após pausa; mandou texto confuso; precisa ser
conduzido para `/pedido`. Hoje todas são resolvidas por classificador próprio —
candidatas naturais ao Brain.

## 11. Riscos

**P0 — nenhum confirmado.**
- Envio em teste é barrado por modo (DRY_RUN/REPLY_ONLY); pedido/Pix só em
  FULL_TEST allowlist; auditor de segurança P0=0; nada impacta cliente real em teste.

**P1 — importantes:**
1. **IA não volta sozinha** após handoff — cliente pode ficar preso no humano sem
   timeout/job de expiração.
2. **Race IA+humano** sem lock transacional (mitigado, não eliminado).
3. **Dedupe de OUTBOUND ausente** — webhook duplicado pode duplicar mensagem.
4. **waToken** em querystring (telefone/nome) + TTL 7 dias (replay de link
   encaminhável).
5. **Duplicação conceitual** Waiter web × ordering por texto (dois "cérebros" de
   venda, vozes/regras podem divergir).
6. **WhatsApp fora do Brain** — intenção/segurança não passam pela Reasoning Layer.
7. Recepcionista **não conduz venda** (só recepciona) — oportunidade comercial.

**P2 — melhorias:**
UX das mensagens; matcher de "menu question" (lacuna W8/W9); simulação WhatsApp
estilo Sim Lab; evidências de atendimento; métricas; testes Playwright/API.

## 12. Lacunas

- Sem adapter para o Foocci Brain (intenção/coerência/contexto não reaproveitados).
- Sem retorno automático de IA / sem expiração de handoff.
- Sem dedupe de envio OUTBOUND / sem fila / sem retry controlado.
- Sem simulação dedicada (dry-run end-to-end) nem evidência de atendimento.
- Matcher de pergunta de cardápio com falha de UX (3 testes vermelhos pré-existentes).

## 13. Recomendações

1. **WhatsApp Brain Adapter v1** (read-only): rotear a classificação de intenção
   pela Reasoning Layer do Brain (guardrails já corrigem pagamento/benefício),
   sem tocar envio/runtime. Maior ganho, menor risco.
2. **Política de retorno de IA / expiração de handoff** (cron-safe): reativar IA
   após X horas de inatividade do humano, com aviso — fecha o P1 mais grave.
3. **Dedupe de OUTBOUND** por chave (conversa+hash+janela) antes de `sendTextMessage`.
4. **Encurtar TTL do waToken** e mover identidade para fora da querystring quando
   possível.
5. **Unificar a "voz de venda"**: decidir se o ordering por texto consome o mesmo
   Brain/contrato do Waiter para não divergir.
6. Corrigir o matcher de "menu question" (P1/P2) e adicionar simulação WhatsApp.

## 14. Próximo prompt sugerido

> "WhatsApp Agent como Department do Foocci Brain — Fase 1: criar o
> `WhatsAppBrainReasoningAdapter` (read-only) espelhando o do Waiter, roteando a
> classificação de intenção pela Reasoning Layer (guardrails + contexto +
> coerência), com testes do caso pagamento/benefício e do handoff — **sem** tocar
> Evolution, envio, pedido, Pix ou runtime. Em paralelo, especificar a política de
> retorno automático de IA / expiração de handoff (apenas contrato + testes, sem
> ativar)."
