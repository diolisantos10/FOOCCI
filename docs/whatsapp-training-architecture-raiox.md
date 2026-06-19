# WhatsApp Agent — Raio-X da Arquitetura de Treinamento da IA

> Data: 2026-06-19 · Branch: `claude/remove-legacy-runner-q8iXa` · HEAD: `3d0edee`
>
> Rodada **somente diagnóstico**: nada de produção foi alterado, nenhum WhatsApp
> real foi enviado, nenhum pedido/Pix foi criado. Validações seguras rodadas:
> `npx tsc --noEmit` (limpo).

---

## 1. Resumo executivo

**A estrutura que o Diego imaginou existe — e em grande parte já funciona — mas
está espalhada, com nome técnico e em painel/aba errados.**

Pontos confirmados:

1. **"Treinamento IA" existe** (`/admin/agentes/training`), no **painel ADMIN
   interno da Foocci**, não no painel do lojista. É um dashboard de treino
   contínuo com fila de aprovação de propostas.
2. **O fluxo "conversa real → erro → resposta ideal → regra → aprovação humana"
   EXISTE e roda automático** — mas não é a tela "Treinamento IA". É a camada
   nova **WhatsApp Live Learning** (`src/services/whatsapp/learning/`), com cron
   diário às 09:00 UTC, e aparece para o lojista em **`/aprendizado-whatsapp`**.
3. **Há DOIS pipelines de aprendizado paralelos** que o Diego provavelmente vê
   como "a mesma coisa confusa":
   - *Pipeline Training* (admin, system-wide): mineração → cenários →
     avaliação por IA → `AgentImprovementProposal` → `AgentBrainVersion` sandbox.
   - *Pipeline Live Learning* (lojista, WhatsApp): conversas reais → cartões de
     aprendizado em linguagem de negócio → `WaiterTrainingSuggestion` (fila).
4. **Aprovar um aprendizado NÃO muda a produção** em nenhum dos dois pipelines —
   é decisão de design (governança). Aprovar só marca para a próxima rodada.
5. **O agente do WhatsApp ainda NÃO raciocina como ChatGPT.** O caminho ao vivo
   é regex + matcher + templates; o único LLM é o fallback do recepcionista. O
   "cérebro" de raciocínio do WhatsApp (`WhatsAppBrainReasoningAdapter`) já
   existe mas está **desligado (shadow/off)** — só roda em diagnóstico.

**O que precisa ser reconstruído:** não a engenharia (ela existe e está testada),
mas a **organização e a linguagem**. Tudo de WhatsApp precisa morar em
**Agentes → WhatsApp**, com linguagem de dono de restaurante, não de engenheiro.

---

## 2. Arquitetura atual (visão de alto nível)

### 2.1 O caminho ao vivo (runtime de produção)

Toda mensagem que entra no WhatsApp passa por um orquestrador:

```
Mensagem WhatsApp (Evolution webhook)
        ↓
WebhookProcessorService.handleInboundMessage()
        ↓
getMessageAwareRoutingDecision()   ← decide o "host"
        ↓
   ┌────────────────────────────┬─────────────────────────────┐
   ↓                            ↓                             ↓
TEXT_ORDER                  RECEPTIONIST                  HUMANO
(motor de pedido            (anfitrião padrão:            (handoff)
 por texto)                  saudação, cardápio,
                             horário, pagamento)
```

Regra de roteamento (`WhatsAppTextOrderingConfigService.ts:345`):

```
vai para Pedido-por-Texto  ⇔  elegível && (sessão ativa || intenção de pedido)
intenção de pedido         =  detectIntent(texto) === "ORDER_REQUEST"  (regex puro)
```

O **recepcionista é o host padrão**; o motor de pedido é uma **ferramenta**
acionada quando há intenção clara de pedido ou sessão de pedido aberta.

### 2.2 Como o agente "pensa" hoje

| Mecanismo | Existe? | Onde |
|---|---|---|
| Regras fixas (regex) | **SIM (dominante)** | `parser.ts:12-47`, `WhatsAppOrderStateMachine.ts`, `WhatsAppReceptionistService.ts:81-116` |
| Matcher de produto | **SIM** | `menuMatcher.ts` (Levenshtein + containment, sem LLM) |
| Templates | **SIM (dominante)** | `buildTemplateReply`, `buildFlowReply`, `buildPaymentInfoReply` (receptionist); `done(...)` strings (state machine) |
| GPT / LLM | **PARCIAL — só recepcionista** | `generateGptReply` `gpt-4o-mini` (`WhatsAppReceptionistService.ts:192`). O motor de pedido tem **zero LLM**. |
| Brain (WaiterBrainV2) | **NÃO no WhatsApp** | WaiterBrainV2 é exclusivo do `/pedido` web |
| Contexto do restaurante | **SIM (recepcionista) / NÃO (pedido)** | recepcionista carrega menu+horário+endereço+conhecimento; state machine só carrega menu |
| Histórico da conversa | **PARCIAL** | recepcionista manda 8 últimas msgs ao GPT; motor de pedido usa só estado da sessão |
| Contexto de pedido | **SIM (motor de pedido)** | sessão com itens, opções, entrega, pagamento |
| Guardrails | **SIM (forte, determinístico)** | anti-loop, classificador anti-link/localização, gate de side-effects |
| Fallback humano | **SIM** | handoff por intenção, reclamação, status de pedido, loop |

---

## 3. Telas encontradas (inventário)

> Há **dois painéis com duas sidebars distintas**: ADMIN interno (Foocci) e
> DASHBOARD do lojista. Hoje **não existe** um grupo "Agentes → WhatsApp" com
> sub-itens em nenhum dos dois — o conteúdo de WhatsApp está espalhado.

### 3.1 Painel ADMIN (sidebar plana, 16 itens soltos — sem agrupamento)

| Tela | Rota | Função atual | WhatsApp? | Deveria ficar |
|---|---|---|---|---|
| Treinamento IA | `/admin/agentes/training` | Dashboard de treino contínuo: 7 passos, falhas ao vivo, arena (replay), **fila de aprovação de propostas**, versões sandbox. Default = WHATSAPP_ORDERING. | parcial | **Agentes → WhatsApp** |
| WA Cockpit | `/admin/agents/whatsapp` | Cockpit de validação do pedido-por-texto (DRY_RUN/REPLY_ONLY/FULL_TEST), checklist, decisão Aprovado/Ajustar/Bloqueado. | **sim** | **Agentes → WhatsApp** |
| WA Pedido Texto | `/admin/diagnostics/whatsapp-text-ordering` | Simulador de conversa + painel de ativação (enabled, mode, allowlist) + suíte de cenários. | **sim** | **Agentes → WhatsApp** |
| WA Pedido Texto (sim. visual) | `/admin/diagnostics/whatsapp-text-ordering/simulator` | Simulador estilo WhatsApp com inspetor de 5 abas. | **sim** | **Agentes → WhatsApp** |
| WA Identity | `/admin/diagnostics/whatsapp-pedido-identity` | Traça cadeia identidade WhatsApp→waToken→/pedido (9 passos). | **sim** | **Agentes → WhatsApp** (avançado) |
| WA Routing Lab | `/admin/diagnostics/whatsapp-routing-test` | Simula eventos sem enviar; testa roteamento. | **sim** | **Agentes → WhatsApp** (avançado) |
| QA Recovery | `/admin/diagnostics/cart-recovery-qa` | Testa recuperação de carrinho; dry-run ou envio real de 1 WhatsApp. | **sim** | **Agentes → WhatsApp** (avançado) |
| Agentes (hub) | `/admin/agents` | Hub read-only de todos os agentes com KPIs. | parcial | Manter como índice |
| Agente (detalhe) | `/admin/agents/[slug]` | Deep-link de um agente. | parcial | Sob Agentes |
| Biblioteca de Agentes | `/admin/agents/library` | Workbench de treino (upload de fontes, extração por IA). | não | Sob Agentes |
| Waiter/CRM/Analytics Testes | `/admin/agentes/{waiter,crm,analytics}/testes` | Suítes determinísticas por agente. | não | Agentes → (cada agente) |
| Controle de Qualidade | `/admin/quality` | Auditoria cross-system P0/P1/P2. | não | Top-level (manter) |
| Brain | `/admin/brain` | Dashboard "Foocci Brain" + fila do Brain Director. **Órfã (fora da nav).** | não | Top-level (religar) |
| Agentes (índice) | `/admin/agentes` | Só redireciona para `/training`. | não | Consolidar |

### 3.2 Painel DASHBOARD (lojista)

| Tela | Rota | Função atual | WhatsApp? | Deveria ficar |
|---|---|---|---|---|
| Agentes IA | `/agente-ia` | Hub de 4 agentes + seção "Aprendizados pendentes" + "Saúde do WhatsApp". | **sim** | Hub do lojista (manter) |
| Aprendizado WhatsApp | `/aprendizado-whatsapp` | 3 abas: conversas reais, aprendizados pendentes (P0/P1/P2) com aprovação, saúde. 100% WhatsApp. | **sim** | **Agentes → WhatsApp** |
| Config. Agente | `/settings/agent` | Form de config do agente WhatsApp. **Duplica aba "WhatsApp Host" de `/agente-ia`.** | **sim** | Consolidar em `/agente-ia` |
| Integração WhatsApp | `/integracoes/whatsapp` | Conexão Evolution API. | **sim** | Manter em Integrações |
| `/settings/ai`, `/settings/whatsapp` | redirects legados | — | n/a | Remover |
| `/ai-simulator`, `/chat-sim`, `/test-ai`, `/waiter-lab` | testes do waiter (fora da sidebar) | — | não | Agentes → Waiter (interno) |

### 3.3 Duplicações / confusões críticas

- **Duas árvores de rota concorrentes**: `/admin/agents/*` (inglês) vs
  `/admin/agentes/*` (português) para o mesmo conceito.
- **Três telas de simulação de pedido WhatsApp** (Cockpit, Pedido Texto, sub-sim).
- **Config do agente WhatsApp em 3 lugares** (aba em `/agente-ia`,
  `/settings/agent`, redirect `/settings/ai`).
- **Aprendizados em 2 lugares** (seção em `/agente-ia` e `/aprendizado-whatsapp`).
- **"Treinamento IA" (system-wide) vs WaiterSimulationLab** se sobrepõem
  conceitualmente (ambos têm fila de propostas + arena).

---

## 4. Modelos / tabelas

| Modelo | Para que serve | Lê conversa real? | Gera aprendizado? | Tem aprovação? | WhatsApp? |
|---|---|---|---|---|---|
| **WaiterTrainingSuggestion** | Caso real vira proposta de treino revisável; **reutilizado p/ aprendizado WhatsApp** via `agentSlug` | **Sim** | **Sim** | **Sim** (PENDING_REVIEW/APPROVED/REJECTED/BACKLOG) | **Sim** (slug `whatsapp-receptionist`) |
| **AgentImprovementProposal** | Proposta de melhoria de uma rodada de treino | Indireto | **Sim** | **Sim** (PENDING_APPROVAL→APPROVED/REJECTED/APPLIED) | parcial |
| **AgentBrainVersion** | Versão candidata de prompt/cérebro; ACTIVE nunca muda sozinha | Não | Sim (artefato) | Lifecycle (DRAFT/SANDBOX/ACTIVE/ARCHIVED) | não |
| **AgentTrainingRun / Scenario / Evaluation** | Rodada de treino, cenário (real replay ou simulado), avaliação por IA | Scenario: **Sim** (`sourceConversationId`) | Não (insumo) | Não (status operacional) | parcial |
| **AgentSimulationRun / Scenario / Opportunity** | Simulação adversarial sintética + achados | Não | Opportunity: **Sim** | Opportunity: **Sim** | parcial |
| **AgentSimulationExample** | Padrão sanitizado de conversa real p/ inspirar simulações | **Sim** (REAL_CONVERSATION) | Sim | **Sim** | parcial (channel WHATSAPP) |
| **BrainChangeRequest** | Governança: mudança estrutural no Brain decidida por humano | Não | Sim (decisão) | **Sim** (7 estados + runtimeImpact) | não |
| **Conversation / Message** | Conversa/mensagem real (fonte de verdade), channel WHATSAPP | **Sim (a fonte)** | Não | Não | **Sim** |
| **WhatsAppOrderingSession / TextOrderingConfig** | Estado do motor de pedido + config de ativação | liga a Conversation | Não | Não | **Sim** |

**Detalhe — `WaiterTrainingSuggestion`** (a tabela da fila de aprovação do
WhatsApp): campos de negócio prontos para a UX — `title`, `situationSummary`,
`customerIntent`, `whatHappened`, `problemDetected`, `idealResponse`,
`trainingRule`, `expectedImpact`, `suggestedActionType`, `riskLevel`,
`sanitized*Excerpt`, `technicalDetails` (Json). Dedup por
`@@unique([agentSlug, sourceType, sourceId])`. O WhatsApp usa
`sourceId = signature do problema` → **uma linha por tipo de erro**, com
`occurrences = N conversas`.

> **Não há modelos legacy/órfãos** na lista — todos têm caminhos de escrita
> ativos no código.

---

## 5. Fluxo de aprendizado atual (etapa a etapa)

| Etapa | Existe? | Onde | Automático? | Lacuna |
|---|---|---|---|---|
| Conversa real do WhatsApp | **Sim** | `liveLearningReview.ts:95` lê `Conversation` channel=WHATSAPP, 24h | Sim (cron 09:00 UTC) | — |
| Erro detectado | **Sim** | `conversationReview.ts:114` `detectIssues` (reusa detectores de produção) | Sim | 6 tipos de erro; pode crescer |
| Análise do erro | **Sim** | `learningAnalysis.ts:45` TEMPLATES por tipo | Sim | Análise é por template fixo, não por IA contextual |
| Resposta ideal sugerida | **Sim** | `learningAnalysis.ts` `idealAnswer` | Sim | Resposta ideal é estática por tipo, não gerada caso-a-caso |
| Regra de aprendizado | **Sim** | `learningAnalysis.ts` `learningRule` | Sim | idem |
| Diego aprova | **Sim** | `WhatsAppLearningQueueService.decideLearning` + `/aprendizado-whatsapp` | Manual (correto) | — |
| Aprendizado entra no treino | **Parcial** | aprovar só muda `status` | **Não (por design)** | **Não há ponte aprovado → próxima rodada de treino do agente** |

**Conclusão:** 6 das 7 etapas existem e rodam automáticas. A 7ª (aprovado →
efetivamente treina o agente) é **deliberadamente manual/inexistente** por
governança. A maior lacuna real é que **resposta ideal e regra são templates
fixos por tipo de erro**, não geração contextual por conversa.

---

## 6. Automações

| Automação | Frequência | O que faz | WhatsApp real? | Gera aprendizado? | Status |
|---|---|---|---|---|---|
| **WhatsApp Live Learning Review** | **Cron diário 09:00 UTC** + manual | Lê conversas reais 24h, classifica, detecta erros, dedup, **persiste fila** | Lê real, **não envia** | **Sim** (`WaiterTrainingSuggestion`) | **Ativo** |
| Agent Training — Mine Real Conversations | Cron 30 min | Minera conversas reais → `AgentTrainingScenario` | Lê real | Sim (cenários) | Ativo |
| Agent Training — Nightly Batch | Cron diário 07:00 UTC | 20 sintéticos + ~15 reais → avalia → **propostas** | Mix | Sim (proposals) | Ativo |
| Agent Training — Small Batch / Backlog | Cron 30 min | Cenários sintéticos auto-propostos / drena backlog | Não / indireto | Sim | Ativo |
| Waiter Training — Real Intake | Cron diário 06:15 UTC | Casos de treino do **waiter** (não recepcionista WhatsApp) | Lê real | Sim | Ativo |
| WhatsApp Full Agent Diagnostic | **Manual** | 13 cenários sintéticos → PASS/WARN/FAIL + recomendação | Não (sintético) | **Não** | On-demand |
| WhatsApp Host Routing Diagnostic | **Manual** | Decide host p/ 1 telefone+msg | Lê metadata, não envia | Não | On-demand |
| WhatsApp Brain / Text-Order Simulator | **Manual** | Casos sintéticos do brain/pedido | Não | Não | On-demand |

**Pontos-chave:**

- O fluxo completo *conversa real → fila de aprovação* **existe e é automático**
  (Live Learning Review).
- A revisão diária **persiste de verdade** no cron (dryRun=false por padrão);
  dry-run só nos dispatches manuais. Respeita decisões humanas anteriores
  (nunca ressuscita APPROVED/REJECTED).
- **Nada envia WhatsApp real** em nenhuma rotina — todo serviço crava e valida
  `noEvolution / noRealOrder / noRealPix / noMessageSent`.
- **Falta**: (a) um **relatório diário consolidado** (hoje só há o log do
  GitHub Actions + o monitor on-demand, que não está em cron); (b) a
  **simulação NÃO alimenta** a fila de aprendizado real (são trilhos separados);
  (c) nenhuma etapa "simule a resposta ideal antes de aprovar".

---

## 7. Qualidade da fila de aprovação (UX)

A fila do WhatsApp (`/aprendizado-whatsapp` → aba Aprendizados) já tem **os 7
elementos** que o Diego pediu, vindos dos campos do `WaiterTrainingSuggestion`:

1. O que o cliente queria → `customerIntent` ✅
2. O que a IA respondeu → `whatHappened` / `sanitizedWaiterExcerpt` ✅
3. Qual foi o erro → `problemDetected` ✅
4. Resposta correta → `idealResponse` ✅
5. O que aprenderia → `trainingRule` ✅
6. Impacto na venda → `expectedImpact` ✅
7. Botões → APPROVE / REJECT / BACKLOG (`decideLearning`) ✅

**Classificação da UX atual: PARCIALMENTE CLARA.**

Por quê:
- **A favor:** o pipeline Live Learning (lojista) já é escrito em linguagem de
  negócio (templates em `learningAnalysis.ts` falam "cliente queria", "impacto
  na venda"), com dedup ("encontrado em N conversas").
- **Contra:** a tela "Treinamento IA" do ADMIN (`/admin/agentes/training`) — que
  é a que o Diego provavelmente associou ao nome — é **técnica demais**: fala em
  cenários, runtime, sandbox, brain version, P0 sem explicação. E há **duas
  filas** (proposals no admin, suggestions no lojista) que parecem a mesma coisa.
- **Contra:** está **no painel/aba errado** — o que o dono precisa ver está
  misturado com ferramenta de engenharia.

---

## 8. Linguagem: termos técnicos a remover da visão principal

| Termo técnico | Trocar por |
|---|---|
| intent | o que o cliente quis dizer |
| runtime | atendimento ao vivo |
| classifier | leitura da mensagem |
| branch / host | caminho do atendimento |
| scenario | exemplo de conversa |
| unknown | não entendido |
| P0 / P1 / P2 (sem contexto) | Urgente / Importante / Pode esperar |
| diagnostic | verificação de saúde |
| loop | a IA se repetiu |
| proposal / suggestion | aprendizado |
| handoff | passar para atendente |
| dry-run | simulação (não afeta clientes) |
| sandbox / brain version | versão de teste do agente |

---

## 9. Como deveria ficar em **Agentes → WhatsApp**

Estrutura proposta (uma casa só para tudo de WhatsApp):

```
Agentes
 └── WhatsApp
      ├── 1. Visão Geral          (saúde + conversão + pendências do dia)
      ├── 2. Conversas de hoje    (conversas reais, PII mascarada, resultado)
      ├── 3. Aprendizados         (fila única de aprovação, linguagem de negócio)
      ├── 4. Simulador            (testar o agente sem afetar clientes)
      ├── 5. Saúde do WhatsApp    (monitor: erros por categoria, abandono)
      ├── 6. Configurações        (personalidade, horários, pagamento)
      └── 7. Modo avançado        (Cockpit, Routing Lab, Identity, QA Recovery)
```

Princípios:
- **Uma fila de aprendizado só** (consolidar proposals do admin + suggestions do
  lojista numa visão única em linguagem de negócio; o técnico vira "Modo avançado").
- **Quality e Brain** continuam **top-level cross-system** (não são só WhatsApp).
- Resolver a dualidade de rota `agents` vs `agentes`.
- Remover redirects `/settings/ai`, `/settings/whatsapp` e a config duplicada em
  `/settings/agent`.

---

## 10. Gap "responder como ChatGPT" vs agente atual

O agente do WhatsApp ainda **não** é consultivo porque o caminho ao vivo é
**determinístico** (regex + matcher + templates), e o único LLM é o fallback do
recepcionista para `UNKNOWN`. O cérebro de raciocínio do WhatsApp
(`WhatsAppBrainReasoningAdapter.reasonWhatsAppMessage`) **já existe mas está
desligado** (shadow/off, gated por `WHATSAPP_BRAIN_ADAPTER_ENABLED`) — só roda em
diagnóstico/simulador/testes, nunca no webhook. O **WaiterBrainV2** (que já vende
de forma consultiva) é **exclusivo do `/pedido` web**, não toca o WhatsApp.

- **Onde pensa bem:** matcher de produto (tolerante a typo, anti-alucinação),
  `smartParse` ciente do cardápio, captura de mensagem mista numa linha, guards
  de intenção antes do matcher, e o fallback GPT do recepcionista (com cardápio,
  horário, conhecimento e histórico).
- **Onde responde burro:** detecção de intenção é regex frágil (paráfrases caem
  fora do pedido), state machine devolve strings fixas, recepcionista responde
  pagamento/pedido por template, e **não há venda consultiva nem upsell** em
  lugar nenhum do WhatsApp.
- **Onde mais precisa de raciocínio:** (1) classificação de intenção no gate de
  roteamento; (2) clarificação/ambiguidade na state machine; (3) venda
  consultiva; (4) respostas livres de pagamento/objeção; (5) geração da prosa.
- **Como conectar sem quebrar:** ligar o adapter já existente em **shadow**
  (logar a decisão ao lado da determinística, sem mudar nada); depois promovê-lo
  primeiro como **reforço de recall de intenção** no gate e como **redator da
  prosa** (regras decidem, LLM só escreve), tudo atrás do flag/kill-switch que já
  existe em `wa-text-ordering-flag.ts` (`DRY_RUN → ALLOWLIST_REPLY_ONLY →
  RESTAURANT_WIDE`), com o classificador `classifyReplyText` como pós-filtro
  duro antes de enviar. **Não mexer no WaiterBrainV2** nem nos side-effects.

---

## 11. Backlog recomendado

### P0 — vender hoje
- **Ligar venda consultiva mínima no WhatsApp** (problema: não há upsell/recomendação;
  solução: adapter em shadow → redator de prosa atrás de flag; onde:
  `WebhookProcessorService` + `WhatsAppBrainReasoningAdapter`; risco: alto
  (produção viva) → começar shadow; teste obrigatório: suíte de contrato de
  roteamento + governança verde; aceite: 0 regressão, decisão ainda
  determinística).
- **Recall de intenção** (problema: paráfrase de pedido cai fora do motor;
  solução: aumentar `messageHasOrderIntent` com o reasoner atrás de flag; onde:
  `WhatsAppTextOrderingConfigService.ts:326`; risco: médio; teste: novos casos de
  intenção + contrato; aceite: mais pedidos reconhecidos sem falso positivo).

### P1 — aprendizado diário
- **Relatório diário consolidado** (problema: só há log do Actions; solução: cron
  que gera snapshot do monitor + resumo de aprendizados; onde: novo cron +
  `liveMonitor.ts`; risco: baixo; teste: pure builder; aceite: 1 artefato/dia).
- **Resposta ideal/regra contextual** (problema: hoje são templates fixos por
  tipo; solução: gerar resposta ideal por conversa via LLM em dry-run, sanitizada;
  onde: `learningAnalysis.ts`; risco: baixo (não toca produção); teste: PII +
  "sem jargão"; aceite: cartões mais específicos).

### P2 — simplificação de UX
- **Consolidar em Agentes → WhatsApp** (estrutura da seção 9; risco: médio;
  teste: navegação; aceite: tudo de WhatsApp numa casa só).
- **Fila de aprendizado única** + **linguagem de negócio** (seção 8; risco:
  baixo; aceite: nenhum termo técnico na visão principal).
- **Resolver `agents` vs `agentes`**, remover redirects/config duplicada.

### P3 — inteligência avançada
- **Promover o WhatsApp Brain Adapter** de shadow → produção (gradual, flag).
- **Ponte aprovado → próxima rodada de treino** (governança: aprovar um
  aprendizado realmente alimentar o treino do agente, com Brain Director).
- **Memória de conversa no motor de pedido** (tom/preferências entre turnos).

---

## 12. Próximo prompt recomendado

> **P0 UX — Consolidar tudo de WhatsApp em "Agentes → WhatsApp" (sem mexer em
> runtime).** Rodada só de front/IA-UX e navegação. Criar o grupo Agentes →
> WhatsApp com as 7 abas (Visão Geral, Conversas de hoje, Aprendizados,
> Simulador, Saúde, Configurações, Modo avançado). Unificar as duas filas de
> aprovação numa visão única em linguagem de negócio (tabela de termos da seção
> 8). Mover as telas WA do admin para "Modo avançado". NÃO alterar
> RESTAURANT_WIDE, allowlist, runtime, WaiterBrainV2, nem enviar WhatsApp real.
> Testes de navegação + manter suíte verde. Commit:
> `feat(whatsapp): consolidate WhatsApp agent under Agentes → WhatsApp`.

---

## Apêndice — arquivos-chave

- Runtime/roteamento: `src/services/evolution/WebhookProcessorService.ts`,
  `src/services/whatsapp/ordering/WhatsAppTextOrderingConfigService.ts:320`
- Motor de pedido: `WhatsAppOrderStateMachine.ts`, `parser.ts`, `menuMatcher.ts`
- Recepcionista (único LLM): `src/services/ai/WhatsAppReceptionistService.ts:192`
- Cérebro WhatsApp (desligado): `src/services/whatsapp/brain/WhatsAppBrainReasoningAdapter.ts`
- Flags/kill-switch: `src/lib/wa-text-ordering-flag.ts`
- Live Learning: `src/services/whatsapp/learning/{liveLearningReview,conversationReview,learningAnalysis,WhatsAppLearningQueueService,liveMonitor,conversationFeed,constants,pii}.ts`
- Fila/modelo: `prisma/schema.prisma` (`WaiterTrainingSuggestion:3510`)
- Telas lojista: `/agente-ia`, `/aprendizado-whatsapp`; sidebar `src/components/layout/Sidebar.tsx`
- Telas admin: `/admin/agentes/training`, `/admin/agents/whatsapp`, `/admin/diagnostics/whatsapp-*`; sidebar `src/app/admin/(area)/AdminSidebar.tsx`
- Crons/workflows: `.github/workflows/{whatsapp-live-learning-review,agent-training-cron,waiter-training-real-conversations}.yml`
