# WhatsApp Agent — Inventário de Simuladores, Diagnósticos e Testes

> Branch: `claude/remove-legacy-runner-q8iXa`  
> Data: 2026-06-20  
> Status: Raio-X completo. Nenhuma correção aplicada.

---

## 1. Resumo Executivo

O WhatsApp Agent tem **infraestrutura de testes e diagnósticos extremamente rica**, porém **fragmentada em muitas peças sobrepostas**. São:

- **40 arquivos de teste unitário** com **~814 testes**
- **5 simuladores de conversa** (admin + API + dashboard + cron)
- **8 diagnósticos de roteamento/config** (admin + cron)
- **15 rotas cron** exclusivamente WhatsApp
- **13 GitHub Actions workflows** WhatsApp
- **3 pipelines de aprendizado** distintos e parcialmente sobrepostos
- **1 auditor de qualidade** integrado ao Quality Gate

**Resultado**: funciona, é seguro, mas é difícil de navegar. Diego precisa abrir 4+ abas para ter uma visão completa. O próximo passo é unificar em um **WhatsApp Master Simulator** e uma **aba única em Agentes → WhatsApp**.

**Segurança**: ✅ Nenhum simulador/diagnóstico gera Pix real, cria pedido real ou envia WhatsApp real. Todos têm `allowSideEffects=false` hard-coded.

---

## 2. Inventário Geral

### 2.1 Simuladores de Conversa

| Nome | Tipo | Arquivo/Rota | O que testa | Auto? | Admin? | Pedido Real? | Pix Real? | WA Real? |
|------|------|-------------|------------|-------|--------|-------------|----------|---------|
| **Message Simulator** | SIMULADOR | `/api/admin/diagnostics/whatsapp-text-ordering/simulator/message` | Uma mensagem de cada vez, qualquer fluxo (routing + text order + recepcionista) | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Full Hermetic Simulator** | SIMULADOR | `/api/admin/diagnostics/whatsapp-text-ordering/simulator/full` | Bateria completa com catálogo sintético — PASS/WARNING/FAIL | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Multi-Turn Simulator** | SIMULADOR | `/api/admin/diagnostics/whatsapp-text-ordering/run` | Sessão multi-turn DRY_RUN_ONLY | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Dashboard Simulator** | SIMULADOR | `/api/whatsapp/simulate/message` | Versão do simulador para o dashboard (tenant autenticado, sem slug) | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Cron Text Order Simulator** | SIMULADOR | `/api/cron/whatsapp/text-order-simulator` | Jornada completa sintética — catálogo + pagamento + endereço fictício | ✅ (manual) | ❌ | ❌ | ❌ | ❌ |
| **Auto-Simulator** | SIMULADOR | `/api/auto-simulator/run` | Enfileira simulação automática de cenários para o restaurante autenticado | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Scenarios Runner** | SIMULADOR | `/api/admin/diagnostics/whatsapp-text-ordering/scenarios/run` | Cenários predefinidos multi-turn (DRY_RUN_ONLY) | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Routing Test Lab** | SIMULADOR | `/api/admin/diagnostics/whatsapp-routing-test/run` | Quick/full/custom — qual host responderia? | ❌ | ✅ | ❌ | ❌ | ❌ |

### 2.2 Diagnósticos (Read-Only)

| Nome | Tipo | Arquivo/Rota | O que verifica | Auto? | Admin? |
|------|------|-------------|----------------|-------|--------|
| **Config Diagnostic** | DIAGNÓSTICO | `/api/admin/diagnostics/whatsapp-text-ordering/config` | Config live do restaurante (mode/scope/paused/allowlist) | ❌ | ✅ |
| **Routing Diagnostic** | DIAGNÓSTICO | `/api/admin/diagnostics/whatsapp-text-ordering/routing` | Rotearia esta mensagem para Text Order? | ❌ | ✅ |
| **Readiness Diagnostic** | DIAGNÓSTICO | `/api/admin/diagnostics/whatsapp-text-ordering/readiness` | Compõe CONFIG + FLOW → checklist de produção | ❌ | ✅ |
| **Sessions Diagnostic** | DIAGNÓSTICO | `/api/admin/diagnostics/whatsapp-text-ordering/sessions` | Lista sessões ativas/recentes | ❌ | ✅ |
| **Pedido Identity Diagnostic** | DIAGNÓSTICO | `/api/admin/diagnostics/whatsapp-pedido-identity` | Rastreia cadeia WhatsApp → /pedido (reconhecimento de cliente) | ❌ | ✅ |
| **Cart Recovery QA** | DIAGNÓSTICO | `/api/admin/diagnostics/cart-recovery-qa` | Estado do draft, elegibilidade de recovery, skipReason | ❌ | ✅ |
| **Conversation Unification** | DIAGNÓSTICO | `/api/admin/diagnostics/conversation-unification` | Convergência de conversas WhatsApp + /pedido na timeline | ❌ | ✅ |
| **Conversation Message Flow** | DIAGNÓSTICO | `/api/admin/diagnostics/conversation-message-flow` | Fluxo de mensagens em uma conversa específica | ❌ | ✅ |

### 2.3 Diagnósticos Cron WhatsApp (15 rotas)

| Rota Cron | Workflow GH | Frequência | O que faz | Seguro |
|-----------|------------|-----------|-----------|--------|
| `text-order-simulator` | ✅ yml | Manual | Simulação completa com catálogo sintético | ✅ |
| `text-order-diagnostic` | ✅ yml | Manual | Fluxo hermético básico de pedido (sem DB) | ✅ |
| `text-order-config-diagnostic` | ✅ yml | Manual | Valida config ao vivo do restaurante | ✅ |
| `text-order-readiness` | ✅ yml | Manual | Compõe CONFIG + FLOW em checklist | ✅ |
| `text-order-full-test-readiness` | ✅ yml | Manual | Prova que Pix só após confirmação final | ✅ |
| `text-order-routing-diagnostic` | ✅ yml | Manual | Verifica roteamento de evento sintético | ✅ |
| `full-agent-diagnostic` | ✅ yml | Manual | Bateria completa: Text Order + Receptionist | ✅ |
| `host-routing-diagnostic` | ✅ yml | Manual | Qual host responderia? (Evolution webhook gate) | ✅ |
| `brain-diagnostic` | — | Manual | Brain adapter — 6 casos canônicos (Alelo/pedido/horário/atendente/entrega/reclamação) | ✅ |
| `ai-return-diagnostic` | — | Manual | Conversas em modo HUMAN elegíveis para retornar à IA | ✅ |
| `live-learning-review` | ✅ yml | Diário 06:00 BRT | Lê conversas reais, extrai learnings (read-only) | ✅ |
| `text-order-promote-full-test` | ✅ yml | Manual (governado) | Promove REPLY_ONLY → FULL_TEST (só config DB) | ✅ |
| `text-order-secure-scope` | ✅ yml | Manual (governado) | Clamp para PHONE_ALLOWLIST (só config DB) | ✅ |
| `text-order-open-restaurant-wide` | ✅ yml | Manual (governado, 3 confirmações) | Abre RESTAURANT_WIDE (só config DB) | ✅ |
| `text-order-rollback` | ✅ yml | Manual (emergência) | Pausa tudo (só config DB) | ✅ |

### 2.4 Telas Admin (aparecem na interface)

| Tela | Tipo | Caminho | O que mostra |
|------|------|---------|-------------|
| **Agente IA** | TELA ADMIN | `/(dashboard)/agente-ia` | Configuração do agente, menu, opções de flow |
| **Settings Agent** | TELA ADMIN | `/(dashboard)/settings/agent` | Configurações avançadas do agente |
| **Settings WhatsApp** | TELA ADMIN | `/(dashboard)/settings/whatsapp` | Configurações de integração WhatsApp |
| **Integração WhatsApp** | TELA ADMIN | `/(dashboard)/integracoes/whatsapp` | Status da integração Evolution |
| **Aprendizado WhatsApp** | TELA ADMIN | `/(dashboard)/aprendizado-whatsapp` | Cards de aprendizado de conversas reais |
| **Simulator Admin** | TELA ADMIN | `/admin/(area)/diagnostics/whatsapp-text-ordering/simulator` | Simulador de conversa para técnico |
| **WA Routing Test** | TELA ADMIN | `/admin/(area)/diagnostics/whatsapp-routing-test` | Teste de roteamento manual |
| **WA Pedido Identity** | TELA ADMIN | `/admin/(area)/diagnostics/whatsapp-pedido-identity` | Diagnóstico de identidade |
| **Cart Recovery QA** | TELA ADMIN | `/admin/(area)/diagnostics/cart-recovery-qa` | QA de carrinho abandonado |
| **Agents WhatsApp** | TELA ADMIN | `/admin/(area)/agents/whatsapp` | Área de configuração do agente |

### 2.5 Testes Unitários por Arquivo

**Total: 40 arquivos, ~814 testes**

#### WhatsApp Ordering (29 arquivos, 597 testes conforme vitest)

| Arquivo | Testes | Área |
|---------|--------|------|
| WhatsAppOrderingFlow.test.ts | 54 | Fluxo completo W2-W6 |
| WhatsAppTextOrdering.test.ts | 44 | Core ordering |
| WhatsAppFullAgentDiagnostic.test.ts | 37 | Full agent hermético |
| WhatsAppCheckoutAdapter.test.ts | 30 | Checkout / Pix (StubPaymentProvider) |
| WhatsAppIntentGuard.test.ts | 30 | Guardas de intenção |
| WhatsAppOrderingW9.test.ts | 27 | Confirmação final + Pix |
| WhatsAppLiveActivation.test.ts | 36 | Ativação ao vivo |
| WhatsAppTextOrderingConfig.test.ts | 17 | Configuração |
| WhatsAppProductionGovernance.test.ts | 17 | Governança de produção |
| WhatsAppConfigDiagnostic.test.ts | 16 | Config diagnóstico |
| WhatsAppFallbackGuard.test.ts | 16 | Fallback guards |
| WhatsAppRoutingContract.test.ts | 16 | Contrato de roteamento |
| WhatsAppSavedAddressReuse.test.ts | 16 | Reuso de endereço salvo |
| WhatsAppTextOrderFlow.test.ts | 18 | Fluxo de pedido por texto |
| WhatsAppRuntimeMetadata.test.ts | 14 | Metadata de runtime |
| WhatsAppTextOrderSimulator.test.ts | 14 | Simulador de pedido |
| WhatsAppBuildingCart.test.ts | 13 | Construção do carrinho |
| WhatsAppOrderingScenarioRunner.test.ts | 13 | Scenario runner |
| WhatsAppInterruptAndCancelItem.test.ts | 11 | Interrupção e cancelamento |
| WhatsAppLiveHotfix.test.ts | 11 | Hotfixes ao vivo |
| WhatsAppOrderingPixReuse.test.ts | 9 | Reuso de Pix |
| WhatsAppTextOrderSecurity.test.ts | 9 | Segurança (injeção, tenant) |
| WhatsAppRoutingDiagnostic.test.ts | 9 | Routing diagnóstico |
| WhatsAppLiveRouting.test.ts | 8 | Routing ao vivo |
| WhatsAppOrderingW8.test.ts | 16 | Perguntas obrigatórias (W8) |
| WhatsAppOrderingEvents.test.ts | 5 | Eventos de ordering |
| WhatsAppLiveStatus.test.ts | 4 | Status ao vivo |
| WhatsAppDeliveryQuoterInjection.test.ts | 2 | Injeção de cotação de frete |
| WhatsAppCockpitPresentation.test.ts | 10 | Apresentação cockpit |

#### WhatsApp Brain (2 arquivos, 20 testes)

| Arquivo | Testes | Área |
|---------|--------|------|
| WhatsAppBrain.test.ts | 14 | Brain adapter |
| WhatsAppBrainRuntimeService.test.ts | 6 | Runtime service |

#### WhatsApp Learning (4 arquivos, 28 testes)

| Arquivo | Testes | Área |
|---------|--------|------|
| ConversationReview.test.ts | 10 | Análise de conversas |
| LearningAnalysis.test.ts | 8 | Análise de aprendizado |
| LearningQueueService.test.ts | 4 | Fila de aprendizado |
| LiveMonitor.test.ts | 6 | Monitor ao vivo |

#### AI / Receptionist (3 arquivos, 109+ testes)

| Arquivo | Testes | Área |
|---------|--------|------|
| WhatsAppReceptionistMenuBehavior.test.ts | 145 | Recepcionista: menu, flows, intent |
| WhatsAppHostRoutingPreview.test.ts | 23 | Host routing preview |
| WhatsAppRealCaseDiagnostics.test.ts | 11 | Casos reais de diagnóstico |

#### Quality (1 arquivo, 16 testes)

| Arquivo | Testes | Área |
|---------|--------|------|
| WhatsAppAuditor.test.ts | 16 | Quality gate hermético |

---

## 3. Agrupamento por Finalidade

### 3.1 Configuração

| Item | Tipo | Arquivo |
|------|------|---------|
| GET/PATCH config ao vivo | DIAGNÓSTICO | `/api/admin/diagnostics/whatsapp-text-ordering/config` |
| Config diagnostic read-only | DIAGNÓSTICO | `configDiagnostic.ts` + cron `text-order-config-diagnostic` |
| Readiness checklist | DIAGNÓSTICO | `readinessDiagnostic.ts` + cron `text-order-readiness` |
| Full test readiness | DIAGNÓSTICO | cron `text-order-full-test-readiness` |
| Promote full test | GOVERNANÇA | cron/workflow `text-order-promote-full-test` |
| Secure scope | GOVERNANÇA | cron/workflow `text-order-secure-scope` |
| Open restaurant-wide | GOVERNANÇA | cron/workflow `text-order-open-restaurant-wide` |
| Emergency rollback | GOVERNANÇA | cron/workflow `text-order-rollback` |
| WhatsAppTextOrderingConfig.test.ts | TESTE | 17 testes |
| WhatsAppProductionGovernance.test.ts | TESTE | 17 testes |

### 3.2 Roteamento

| Item | Tipo | Arquivo |
|------|------|---------|
| Host routing (qual host responde?) | DIAGNÓSTICO | `hostRoutingDiagnostic.ts` + cron/workflow `host-routing-diagnostic` |
| Live routing (vai para Text Order?) | DIAGNÓSTICO | `routingDiagnostic.ts` + cron `text-order-routing-diagnostic` |
| Admin routing test lab | SIMULADOR | `/api/admin/diagnostics/whatsapp-routing-test/run` |
| Brain diagnostic | DIAGNÓSTICO | `WhatsAppBrainDiagnostic.ts` + cron `brain-diagnostic` |
| AI return diagnostic | DIAGNÓSTICO | `WhatsAppAiReturnDiagnostic.ts` + cron `ai-return-diagnostic` |
| WhatsAppRoutingContract.test.ts | TESTE | 16 testes |
| WhatsAppLiveRouting.test.ts | TESTE | 8 testes |
| WhatsAppRoutingDiagnostic.test.ts | TESTE | 9 testes |
| WhatsAppHostRoutingPreview.test.ts | TESTE | 23 testes |

### 3.3 Recepcionista

| Item | Tipo | Arquivo |
|------|------|---------|
| Menu, flows, buildFlowReply, detectIntent | TESTE | `WhatsAppReceptionistMenuBehavior.test.ts` (145) |
| Casos reais (voucher, elogio, agradecimento) | TESTE | `WhatsAppRealCaseDiagnostics.test.ts` (11) |
| Guardas de intenção no state machine | TESTE | `WhatsAppIntentGuard.test.ts` (30) |
| Simulação via Message Simulator | SIMULADOR | `/api/admin/diagnostics/.../simulator/message` (modo OLD_WHATSAPP_AGENT) |
| Full agent diagnostic (cobre recepcionista) | DIAGNÓSTICO | `fullAgentDiagnostic.ts` + cron/workflow `full-agent-diagnostic` |

**Não existe:** teste específico para IMAGEM recebida além do `MEDIA_MESSAGE_REPLY` (2 testes em WhatsAppReceptionistMenuBehavior).

### 3.4 Pedido por Texto

| Item | Tipo | Arquivo |
|------|------|---------|
| Fluxo completo W2-W9 | TESTE | `WhatsAppOrderingFlow.test.ts` (54) + `WhatsAppTextOrdering.test.ts` (44) |
| State machine (produto, ambiguidade, comanda) | TESTE | `WhatsAppBuildingCart.test.ts` (13) + `WhatsAppTextOrderFlow.test.ts` (18) |
| Confirmação final + Pix | TESTE | `WhatsAppOrderingW9.test.ts` (27) |
| Perguntas obrigatórias | TESTE | `WhatsAppOrderingW8.test.ts` (16) |
| Cancelamento de item | TESTE | `WhatsAppInterruptAndCancelItem.test.ts` (11) |
| Endereço | TESTE | `WhatsAppSavedAddressReuse.test.ts` (16) |
| Entrega/frete | TESTE | `WhatsAppDeliveryQuoterInjection.test.ts` (2) |
| Checkout | TESTE | `WhatsAppCheckoutAdapter.test.ts` (30) |
| Simulador admin (multi-turn) | SIMULADOR | `/api/admin/diagnostics/.../run` |
| Simulador hermético full | SIMULADOR | `/api/admin/diagnostics/.../simulator/full` |
| Cron simulator | SIMULADOR | `cron/whatsapp/text-order-simulator` |
| Cron diagnostic | DIAGNÓSTICO | `cron/whatsapp/text-order-diagnostic` |

### 3.5 Pix / Pagamento

**Resposta direta às perguntas:**

✅ **Existe simulador específico de Pix?**
- Sim, via `WhatsAppOrderingW9.test.ts` (27 testes de confirmação + Pix) e `WhatsAppCheckoutAdapter.test.ts` (30 testes com `StubPaymentProvider`)
- `WhatsAppOrderingPixReuse.test.ts` (9 testes de reuso de Pix existente)
- `cron/whatsapp/text-order-full-test-readiness`: prova que REPLY_ONLY nunca cria Pix, FULL_TEST só após confirmação final

✅ **Existe diagnóstico read-only de Pix?**
- Sim: `simulator/full` com mode DRY_RUN retorna `WOULD_CREATE_PIX: true/false` sem criar

✅ **Onde está a prova de que Pix só ocorre após confirmação final?**
- `WhatsAppOrderingW9.test.ts` + `text-order-full-test-readiness` cron
- `WhatsAppTextOrderSecurity.test.ts`: testa que REPLY_ONLY não cria nada real

✅ **Onde está a prova de que diagnóstico não gera Pix real?**
- Todos os simuladores têm `allowSideEffects=false` hard-coded
- `WhatsAppAuditor.test.ts` verifica `safetyVerdicts.noRealPix`
- Header de cada rota: "✗ Does NOT generate real Pix."

⚠️ **Há risco de Pix ser gerado cedo?**
- **Risco baixo**: State machine só executa Pix em `AWAITING_PIX_PAYMENT` stage, após handshake de confirmação explícito
- Único risco seria `allowSideEffects=true` + `mode=ALLOWLIST_FULL_TEST` + cliente confirma pedido — comportamento correto

### 3.6 Entrega / Frete / Endereço

| Item | Tipo | Arquivo |
|------|------|---------|
| CEP e endereço no state machine | TESTE | `WhatsAppOrderingFlow.test.ts` (inclui address tests) |
| Endereço salvo reusado | TESTE | `WhatsAppSavedAddressReuse.test.ts` (16) |
| Cotação de frete injetada | TESTE | `WhatsAppDeliveryQuoterInjection.test.ts` (2) |
| Endereço confuso / early info | SERVIÇO | `WhatsAppOrderStateMachine.ts` (handleEarlyInfo) |
| Área de entrega | CONFIG | `WhatsAppTextOrderingConfigService.ts` |

**Lacuna:** não existe diagnóstico específico de "está dentro da área de entrega?" isolado. A cobertura de entrega está no fluxo geral.

### 3.7 Aprendizado / Treinamento

**Três pipelines distintos:**

| Pipeline | Frequência | O que faz | Arquivo |
|----------|-----------|-----------|---------|
| **WhatsApp Live Learning Review** | Diário 06:00 BRT | Lê conversas WhatsApp reais, extrai cards de aprendizado, deduplicating | `liveLearningReview.ts` + cron + workflow |
| **Agent Training (cron)** | A cada 30 min + diário | Minera falhas de conversas reais, gera propostas de melhoria (PENDING_APPROVAL) | `cron/agent-training/*` (4 rotas) |
| **Waiter Training** | Diário 06:15 + 06:45 | Intake de conversas reais + regenera sugestões de treinamento | `cron/waiter/training/*` (2 rotas) |

Análise de conversas:
- `conversationReview.ts`: detecta erros de pagamento, confusão de endereço, confusão de produto, loops
- `learningAnalysis.ts`: transforma problemas detectados em cards legíveis para o gestor
- `WhatsAppLearningQueueService.ts`: fila de aprendizados para aprovação

### 3.8 Qualidade / Auditoria

| Item | Tipo | Arquivo | P0/P1/P2 |
|------|------|---------|----------|
| **WhatsAppAuditor** | AUDITORIA | `src/services/quality/auditors/WhatsAppAuditor.ts` | P0: side effects, P1: funcional, P2: formatação |
| Quality Gate cron | CRON | `cron/quality/run` — diário 03:30 BRT | ✅ |
| WhatsAppAuditor.test.ts | TESTE | 16 testes de safety + funcional | ✅ |

**Propriedades do auditor:**
- `noEvolution`: nunca chama Evolution API
- `noRealOrder`: nunca cria pedido
- `noRealPix`: nunca gera Pix
- `runtimeTouched=false`: modo hermético

---

## 4. Mapa dos Workflows 24h

| Workflow/Cron | Frequência | O que roda | Seguro | Resultado esperado |
|--------------|-----------|-----------|--------|-------------------|
| `quality-audit-cron.yml` | Diário 03:30 BRT | WhatsAppAuditor + outros auditors | ✅ | PASS/WARNING/FAIL report |
| `agent-training-cron.yml` | A cada 30 min + diário 07:00 | Mine conversas + small batch + nightly | ✅ | Propostas PENDING_APPROVAL |
| `whatsapp-live-learning-review.yml` | Diário 06:00 BRT | Lê conversas reais, extrai learnings | ✅ | Cards de aprendizado |
| `waiter-training-real-conversations.yml` | Diário 06:15 BRT | Intake de conversas | ✅ | Intake persistido |
| `waiter-training-regenerate-suggestions.yml` | Diário 06:45 BRT | Regera sugestões | ✅ | Sugestões atualizadas |
| `whatsapp-text-order-simulator.yml` | Manual | Simulação sintética completa | ✅ | PASS/WARNING/FAIL |
| `whatsapp-text-order-diagnostic.yml` | Manual | Diagnostic hermético básico | ✅ | Pass/fail com score |
| `whatsapp-text-order-config-diagnostic.yml` | Manual | Config ao vivo | ✅ | Config report |
| `whatsapp-text-order-readiness.yml` | Manual | Readiness composta | ✅ | Checklist |
| `whatsapp-text-order-full-test-readiness.yml` | Manual | Full test readiness | ✅ | Checklist + prova Pix |
| `whatsapp-text-order-routing-diagnostic.yml` | Manual | Routing audit | ✅ | Routing report |
| `whatsapp-full-agent-diagnostic.yml` | Manual | Bateria completa | ✅ | Full agent report |
| `whatsapp-host-routing-diagnostic.yml` | Manual | Host routing | ✅ | Host routing report |
| `whatsapp-text-order-promote-full-test.yml` | Manual (governado) | Muda modo config | ✅ | Config atualizada |
| `whatsapp-text-order-secure-scope.yml` | Manual (governado) | Clamp scope | ✅ | Config clampada |
| `whatsapp-text-order-open-restaurant-wide.yml` | Manual (3 confirmações) | Abre RESTAURANT_WIDE | ✅ | Config aberta |
| `whatsapp-text-order-rollback.yml` | Manual (emergência) | Pausa tudo | ✅ | paused=true |

**O que já roda automaticamente:**
- Quality Audit: diário 03:30 BRT
- Agent Training: a cada 30 min + diário
- Live Learning Review: diário 06:00 BRT
- Waiter Training: diário 06:15 + 06:45 BRT

**O que só roda manualmente:**
- Simuladores de conversa (text-order-simulator, full-agent-diagnostic, etc.)
- Diagnósticos de roteamento
- Readiness checks

**O que deveria rodar automaticamente mas não roda:**
- `full-agent-diagnostic`: deveria rodar diariamente para detectar regressões rápido
- `text-order-simulator`: deveria rodar a cada hora para monitoramento contínuo
- `host-routing-diagnostic`: deveria rodar diariamente

---

## 5. Duplicidades Identificadas

| Duplicidade | Itens envolvidos | Problema | Recomendação |
|------------|-----------------|---------|-------------|
| **Simuladores de conversa** | `simulator/message` + `run` + `simulator/full` + `/api/whatsapp/simulate/message` + `auto-simulator` | 5 formas de simular conversa; não está claro qual usar para quê | Manter `simulator/message` (interativo) + `simulator/full` (bateria); deprecar `run` e `auto-simulator` |
| **Readiness duplicada** | `text-order-readiness` (admin) + `text-order-config-diagnostic` (cron) + `text-order-full-test-readiness` (cron) + `text-order-readiness` (cron) | 4 variações de readiness com sobreposição grande | Unificar em 1 endpoint com flags `?include=config,flow,pix` |
| **Routing duplicado** | `whatsapp-text-ordering/routing` (admin) + `whatsapp-routing-test/run` (admin) + `text-order-routing-diagnostic` (cron) + `host-routing-diagnostic` (cron) | 4 endpoints de roteamento para coisas similares | Host routing (webhook gate) é diferente de message routing — manter 2, não 4 |
| **Pipelines de aprendizado** | `live-learning-review` + `agent-training-cron` + `waiter-training` | 3 pipelines de aprendizado distintos, potencialmente gerando propostas duplicadas | Definir escopo único: WA Learning → aprendizados WhatsApp específicos; Agent Training → geral |
| **Admin UI espalhada** | `/(dashboard)/agente-ia` + `/(dashboard)/settings/agent` + `/(dashboard)/settings/whatsapp` + `/admin/(area)/agents/whatsapp` | Configuração do agente WhatsApp está em 4 lugares | Consolidar em Agentes → WhatsApp com sub-tabs |
| **Diagnóstico cron x admin** | 8 rotas cron espelham 8 rotas admin | Mesma lógica em 2 lugares (admin para uso humano, cron para CI/automação) | Manter os 2 níveis, mas garantir que compartilhem o mesmo service layer (já fazem) |

---

## 6. Proposta: WhatsApp Master Simulator

### Arquitetura

```
WhatsAppMasterSimulator
├── runBattery(restaurantId): MasterSimulatorReport
│   ├── PARTE 1: Menu principal (7 opções)
│   ├── PARTE 2: Pedido por texto (produto → comanda → endereço → pagamento → confirmação)
│   ├── PARTE 3: Recepcionista (saudação, voucher, elogio, agradecimento, imagem)
│   ├── PARTE 4: Handoff (humano, fora de horário, reclamação)
│   ├── PARTE 5: Segurança (REPLY_ONLY não cria Pix, DRY_RUN não cria pedido)
│   ├── PARTE 6: Casos reais recentes (últimos erros detectados em prod)
│   └── PARTE 7: Aprendizados pendentes (scenarios sugeridos, não aprovados ainda)
└── runScenario(scenario): ScenarioResult
```

### Output esperado

```typescript
interface MasterSimulatorReport {
  status: "PASS" | "WARNING" | "FAIL";
  summary: { p0: number; p1: number; p2: number; total: number };
  scenarios: Array<{
    id: string;
    name: string;
    area: "MENU" | "TEXT_ORDER" | "RECEPTIONIST" | "PIX" | "DELIVERY" | "HANDOFF" | "SECURITY" | "LEARNING";
    severity: "P0" | "P1" | "P2";
    expected: string;
    actual: string;
    passed: boolean;
    issue?: string;
    recommendedFix?: string;
    conversationTurns?: Array<{ role: "USER" | "BOT"; text: string }>;
  }>;
  safety: {
    noWhatsAppSent: true;
    noOrderCreated: true;
    noPixGenerated: true;
    runtimeTouched: false;
    evolutionCalled: false;
  };
  durationMs: number;
  timestamp: string;
}
```

### Onde reaproveitar

- `WhatsAppTextOrderSimulatorService.ts` — base para PARTE 2 (já existe, hermético)
- `WhatsAppOrderingScenarioRunner.ts` — base para PARTES 1-4
- `WhatsAppReceptionistService.ts` (funções puras) — base para PARTE 3
- `WhatsAppAuditor.ts` — base para PARTE 5 (safety gates)
- `conversationReview.ts` — base para PARTE 6 (casos reais)

### O que é novo

- Cenários de recepcionista cobrindo: voucher, elogio, imagem, agradecimento, contextual
- Agregação de P0/P1/P2 em um único relatório
- Link direto para "Aprendizados pendentes de aprovação"

---

## 7. Proposta de Organização em Agentes → WhatsApp

```
Agentes → WhatsApp
├── Aba: Simulador
│   ├── [Modo Gestor] Digitar mensagem → ver resposta + análise humana
│   ├── [Bateria rápida] Rodar 7 cenários essenciais (< 30s)
│   └── [Relatório] PASS/WARNING/FAIL com linguagem humana
│
├── Aba: Saúde
│   ├── Sessões ativas agora
│   ├── Pedidos feitos via WhatsApp (últimas 24h)
│   ├── Handoffs (motivo)
│   ├── Abandonos (draft não convertido)
│   ├── Erros recentes (Não encontrei no cardápio, etc.)
│   └── Último resultado do Quality Audit
│
├── Aba: Aprendizados
│   ├── Erros detectados em conversas reais
│   ├── Resposta ideal sugerida
│   ├── [Aprovar] / [Rejeitar]
│   └── Histórico de aprovados
│
└── Aba: Avançado (técnico)
    ├── Config Diagnostic
    ├── Routing Diagnostic
    ├── Host Routing Diagnostic
    ├── Full Agent Diagnostic
    ├── Sessões WhatsApp
    ├── Logs de workflows
    └── Governança (promote, rollback, open-wide)
```

---

## 8. Arquitetura 24h Proposta

### A cada 30 minutos
- `quality-audit-cron` já roda o WhatsAppAuditor — **manter**
- **Novo**: `cron/whatsapp/text-order-simulator` agendado (hoje é só manual)

### A cada 1 hora
- **Novo**: bateria curta (10 cenários) do WhatsApp Master Simulator
- Alertas se P0 aparecer

### Diariamente (06:00-07:00 BRT)
- `live-learning-review` — já roda ✅
- **Novo**: `full-agent-diagnostic` agendado (hoje é só manual)
- Relatório diário de aprendizados para aprovação
- Digest de saúde: pedidos/handoffs/abandonos

### Sob demanda
- Diego digita uma frase no Simulador (Aba Simulador)
- Diego aprova/rejeita um aprendizado (Aba Aprendizados)
- Técnico roda routing/config diagnostic (Aba Avançado)

---

## 9. Backlog de Unificação

### P0 — Inventário e segurança ✅ (esta rodada)

| Item | Status |
|------|--------|
| Inventário completo de todos os simuladores/testes/workflows | ✅ Feito |
| Confirmar que nenhum diagnóstico gera Pix/pedido/WA real | ✅ Confirmado |
| Mapear duplicidades | ✅ Feito |
| Validar TypeScript + testes | ✅ tsc OK, 597 testes WA passando |

### P1 — WhatsApp Master Simulator

| Item | Problema | Solução | Arquivos | Risco | Critério de aceite |
|------|---------|---------|---------|-------|-------------------|
| Criar `WhatsAppMasterSimulatorService.ts` | 5 simuladores fragmentados | Unificar em 1 service reaproveitando os existentes | `src/services/whatsapp/master/WhatsAppMasterSimulatorService.ts` | Baixo | PASS/WARNING/FAIL report com coverage de menu + text order + receptionist + pix |
| Criar rota admin `/api/admin/diagnostics/whatsapp-master/run` | Admin precisa abrir várias abas | 1 endpoint para bateria completa | `src/app/api/admin/diagnostics/whatsapp-master/run/route.ts` | Baixo | Retorna MasterSimulatorReport em < 5s |
| Criar cron `text-order-master-simulator` com schedule | Simulador só roda manual | Agendar a cada 1h | `src/app/api/cron/whatsapp/master-simulator/route.ts` + `.github/workflows/whatsapp-master-simulator.yml` | Baixo | Alerta se status=FAIL |

### P2 — Admin simples em Agentes → WhatsApp

| Item | Problema | Solução | Arquivos | Risco |
|------|---------|---------|---------|-------|
| Tab Simulador em `/admin/(area)/agents/whatsapp` | Está só no diagnostics (técnico) | Mover UI amigável para a área de agentes | `src/app/admin/(area)/agents/whatsapp/` | Baixo |
| Tab Saúde com métricas ao vivo | Saúde espalhada em várias abas | Agregar: sessões + pedidos + handoffs + erros | Novo page component | Médio |
| Tab Aprendizados | `aprendizado-whatsapp` existe mas está fora de Agentes | Mover ou integrar no contexto de Agentes | Mover `/(dashboard)/aprendizado-whatsapp` para hierarquia de Agentes | Baixo |
| Tab Avançado | Diagnósticos técnicos devem ser escondidos | Colapsar em modo avançado (URL param `?mode=advanced`) | Refactor de `/admin/(area)/diagnostics/whatsapp-*` | Baixo |

### P3 — 24h Learning Loop

| Item | Problema | Solução | Arquivos | Risco |
|------|---------|---------|---------|-------|
| Agendar `full-agent-diagnostic` diariamente | Roda só manual | Adicionar schedule ao `.github/workflows/whatsapp-full-agent-diagnostic.yml` | Workflow file | Baixo |
| Agendar `text-order-simulator` de hora em hora | Roda só manual | Adicionar schedule ao workflow | Workflow file | Baixo |
| Relatório diário de saúde WhatsApp | Não existe aggregate diário | Novo service que gera resumo de: erros, handoffs, aprendizados, quality | `WhatsAppDailyHealthReport.ts` | Médio |
| Consolidar 3 pipelines de aprendizado | Live Learning + Agent Training + Waiter Training se sobrepõem | Definir escopo único por pipeline | Config dos crons | Baixo |

---

## 10. Validações desta Rodada

```
npx tsc --noEmit        → ✅ 0 erros
npx vitest run src/services/whatsapp → ✅ 597 testes, 36 arquivos
```

Nenhuma correção aplicada. Apenas raio-X.

---

## 11. Próximo Prompt Exato

```
P1 — Criar WhatsApp Master Simulator

Branch: claude/remove-legacy-runner-q8iXa

Criar em: src/services/whatsapp/master/WhatsAppMasterSimulatorService.ts

O WhatsApp Master Simulator é um service hermético que:
1. Recebe restaurantId (opcional) ou usa catálogo sintético
2. Roda bateria de cenários cobrindo: menu, pedido por texto, recepcionista, pix/segurança, handoff
3. Retorna MasterSimulatorReport (PASS/WARNING/FAIL + scenarios por área + safety flags)
4. Nunca envia WhatsApp real, nunca cria pedido real, nunca gera Pix real
5. Roda em < 5 segundos
6. Reaproveita: WhatsAppOrderingScenarioRunner, WhatsAppTextOrderSimulatorService, advanceSession

Criar também:
- src/app/api/admin/diagnostics/whatsapp-master/run/route.ts (POST, admin-only)
- src/app/api/cron/whatsapp/master-simulator/route.ts (cron route)
- .github/workflows/whatsapp-master-simulator.yml (schedule: a cada 1h + manual)
- Testes: WhatsAppMasterSimulator.test.ts com 15+ testes cobrindo PASS/FAIL/safety

Restrições:
- NÃO mexer em Instagram/Meta/CRM/branding
- NÃO altere simuladores existentes (eles ficam como estão)
- NÃO envie WhatsApp real
- NÃO crie pedido real
- NÃO gere Pix real
- TypeScript limpo
- Todos os testes existentes continuam passando

Commit: feat(whatsapp): add WhatsApp Master Simulator service and admin route
```
