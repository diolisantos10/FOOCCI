# WhatsApp Agent — Raio-X de Sincronização (prompts paralelos)

> Data: 2026-06-17 · Branch: `claude/remove-legacy-runner-q8iXa` · HEAD: `e91c6aa`
>
> Motivação: duas sessões Claude trabalham no mesmo branch. Este doc reconcilia
> o estado real antes de qualquer próximo prompt.

---

## 1. Por que este raio-X

Diego identificou que dois chats paralelos (sessão A `01K6yY3L5HnGoccWgH6defst` e
sessão B `013xs71KDwUMJZAi6yvHEYcS`) trabalharam no mesmo branch e temia:
- commits sobrescrevendo uns aos outros;
- diagnósticos duplicados;
- relatórios "verde" em SHAs diferentes do HEAD real;
- backlog desatualizado.

**Resultado:** não houve conflito real. Os dois chats pusaram em sequência (cada
um fez fetch/rebase antes de pushar), e o segundo chat reconheceu a entrega do
primeiro em vez de reimplementá-la.

---

## 2. Inventário de commits recentes (HEAD → base)

| Commit | Sessão | Tema | Arquivos principais |
|---|---|---|---|
| `e91c6aa` | B (este) | Full Agent Diagnostic → 13 cenários, 24 testes | fullAgentDiagnostic.ts, test, docs |
| `f9968e5` | B (este) | fix Atendimento: multicanal badge (`take:5`) | conversations/route.ts |
| `ef3a6b4` | A | fix(whatsapp): label receptionist handoff by branch | WhatsAppReceptionistService.ts |
| `b9e53fa` | A | feat(whatsapp): gated open-to-final-customers + rollback + live monitoring | liveStatus, open-restaurant-wide, productionGovernance |
| `716e86f` | B (este) | fix(crm): retryable classification + 80 testes P0 | CRM services |
| `6a5a4bb` | B (este) | fix(crm): failure classification, empty-message guard | CRM services |
| `e8c0418` | B (este) | fix(crm): normalize Evolution phone, HTTP body | CRM services |
| `e85f398` | A | test(whatsapp): Full Agent Diagnostic v1 (11 cenários, 16 testes) | fullAgentDiagnostic.ts, route, workflow, docs |
| `f1c90f9` | A | fix(whatsapp): receptionist path diagnostics (host-routing) | hostRoutingDiagnostic.ts, route, workflow, tests |
| `964a65c` | A | fix(sounds): remove audio-blocked UI | operation pages |
| `71d3d11` | A | docs(whatsapp): add current agent raio-x | whatsapp-agent-current-raiox.md |
| `62b16c0` | A | test(whatsapp): real case routing diagnostics | WhatsAppRealCaseDiagnostics.test.ts |
| `64b928b` | A | docs(whatsapp): routing raio-x | whatsapp-routing-raiox.md |
| `de14b42` | A | fix(whatsapp): route explicit text orders correctly | WhatsAppReceptionistService, parser.ts |
| `f37b846` | A | fix(whatsapp): stabilize text order live flow | WhatsAppTextOrderingRuntimeService |

**Sem conflito detectado.** Sessão B leu e85f398 (entrega da sessão A) e expandiu
os cenários em vez de reimplementar.

---

## 3. Inventário de arquivos/serviços

### WhatsApp core — todos presentes e íntegros

| Arquivo | Existe | Observação |
|---|---|---|
| `WebhookProcessorService` | ✅ | webhook real do Evolution |
| `getMessageAwareRoutingDecision` | ✅ | gate de elegibilidade |
| `WhatsAppReceptionistService` | ✅ | host padrão; safe-menu, handoff, endereço |
| `WhatsAppTextOrderingRuntimeService` | ✅ | máquina de estados do Text Order |
| `WhatsAppOrderStateMachine` | ✅ | dentro de ordering/ |
| `parser.ts` / `detectIntent` | ✅ | ORDER_REQUEST, GREETING, etc. |
| `menuFooter.ts` / `menuMatcher.ts` | ✅ | footer seguro e seleção de opção |
| `WhatsAppDeliveryService` | ✅ | CEP → frete |
| `checkoutBridge.ts` | ✅ | ponte para checkout |
| `WhatsAppPaymentService` | ✅ | Pix após confirmação |
| `WhatsAppOrderCreationService` | ✅ | cria pedido real (FULL_TEST apenas) |
| `liveStatus.ts` | ✅ | monitor read-only (b9e53fa) |
| `productionGovernance.ts` | ✅ | gates de promoção (b9e53fa) |

### Diagnósticos — todos presentes

| Diagnóstico | Rota | Workflow | Cobre Text Order | Cobre Receptionist |
|---|---|---|---|---|
| Config Diagnostic | `/api/cron/whatsapp/text-order-config-diagnostic` | ✅ | config+risco | ❌ |
| Routing Diagnostic | `/api/cron/whatsapp/text-order-routing-diagnostic` | ✅ | elegibilidade+telefone | ❌ |
| **Host Routing Diagnostic** | `/api/cron/whatsapp/host-routing-diagnostic` | ✅ | ✅ via gate real | ✅ SAFE_MENU/LINK/HANDOFF/LOCATION |
| **Full Agent Diagnostic** | `/api/cron/whatsapp/full-agent-diagnostic` | ✅ | ✅ (TEXT_ORDER path) | ✅ (RECEPTIONIST path) |
| Full-Test Readiness | `/api/cron/whatsapp/text-order-full-test-readiness` | ✅ | config/segurança | ❌ |
| Simulator/Cockpit | `/api/cron/whatsapp/text-order-simulator` | ✅ | jornada sintética | ❌ |
| Quality WhatsApp Auditor | `QualityControlService` (cron) | ✅ via quality-audit | ✅ DRY_RUN_ONLY | ❌ |

### Workflows (`.github/workflows/`)

- `whatsapp-full-agent-diagnostic.yml` ✅ — falha se `p0>0` ou safety violada
- `whatsapp-host-routing-diagnostic.yml` ✅
- `whatsapp-text-order-config-diagnostic.yml` ✅
- `whatsapp-text-order-diagnostic.yml` ✅
- `whatsapp-text-order-routing-diagnostic.yml` ✅
- `whatsapp-text-order-full-test-readiness.yml` ✅
- `whatsapp-text-order-open-restaurant-wide.yml` ✅ (gated — gates de promoção)
- `whatsapp-text-order-rollback.yml` ✅
- `whatsapp-text-order-simulator.yml` ✅
- `whatsapp-text-order-promote-full-test.yml` ✅
- `whatsapp-text-order-secure-scope.yml` ✅

### Docs

- `docs/whatsapp-routing-raiox.md` ✅ (atualizado com §15 Full Agent v2)
- `docs/whatsapp-agent-current-raiox.md` ✅
- `docs/whatsapp-agent-production-readiness.md` ✅ (13 cenários, decisão)
- `docs/whatsapp-text-order-final-status.md` ✅
- `docs/whatsapp-text-order-controlled-test.md` ✅

---

## 4. Estado real de configuração de produção (Sushi Cazza)

Sem acesso direto ao DB de produção nesta sessão — estado inferido dos commits e docs.

| Item | Valor inferido | Fonte |
|---|---|---|
| `enabled` | `true` | docs/whatsapp-agent-production-readiness.md |
| `mode` | `ALLOWLIST_FULL_TEST` | idem |
| `scope` | `PHONE_ALLOWLIST` | idem |
| allowlist | 1 número (`…223`) | idem |
| `paused` | `false` (presumido) | idem |
| `RESTAURANT_WIDE` | `false` / nunca aberto | constraint explícita |
| `riskLevel` | `MEDIUM` | docs |
| Global kill-switch | não ativado (presumido) | env var `WHATSAPP_TEXT_ORDERING_ENABLED` não sinalizado |

**Pode criar pedido real agora?** Sim — apenas para `…223` (ALLOWLIST_FULL_TEST).
**Pode gerar Pix real agora?** Sim — apenas para `…223`, após confirmação final.
**Cliente real fora da allowlist entra onde?** Recepcionista → SAFE_MENU (nunca TEXT_ORDER, nunca Pix).

---

## 5. Validações locais

| Validação | Resultado |
|---|---|
| `tsc --noEmit` | ✅ zero erros |
| `prisma format` | ✅ schema válido |
| `prisma validate` | ❌ DATABASE_URL ausente localmente (Railway runtime secret — esperado) |
| `prisma generate` | ✅ client gerado |
| `npm run build` | ✅ build limpo (Next.js production) |
| `vitest run whatsapp/` + `quality/` + `brain/` + `order/` | ✅ 717 testes passam em 51 arquivos |
| `vitest run ai/tests/WaiterBrainV2.sales-core` | ⚠️ 26 falhas pré-existentes (Sprint 4B/4D/4E/4F — features não implementadas) |
| `vitest run ai/tests/WaiterBrainV2.sales-specialist` | ⚠️ falhas pré-existentes (mesmo motivo) |

**WaiterBrainV2 sales-core/sales-specialist**: pré-existente, não relacionado ao
WhatsApp Agent, não deve ser tocado (constraint explícita do Diego).

---

## 6. Diagnósticos em produção

Sem `CRON_SECRET` nem `FOOCCI_BASE_URL` disponíveis no ambiente local desta sessão —
não é possível chamar produção diretamente. O workflow `whatsapp-full-agent-diagnostic.yml`
é o mecanismo oficial para rodar em produção (requer GitHub Actions com secrets).

**Como rodar manualmente quando necessário:**
```bash
curl -X POST "https://foocci.com.br/api/cron/whatsapp/full-agent-diagnostic" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"restaurantSlug":"sushi-cazza","nonAllowlistedPhone":"+5511900000000","fieldValidated":false}'
```

---

## 7. Matriz de estado atual (HEAD e91c6aa)

| Área | Estado | Evidência | Risco | Próxima ação |
|---|---|---|---|---|
| Config produção | ✅ ALLOWLIST_FULL_TEST / PHONE_ALLOWLIST | docs + commits | `…223` gera Pix real | Nenhuma — estado correto |
| Allowlist | ✅ 1 número (`…223`) | docs | Cobrança real se engano | Diego decide expansão |
| Text Order (routing) | ✅ provado por testes unitários | 717 tests pass | campo não validado | Piloto de campo (humano) |
| Text Order (runtime) | ✅ CEP→frete→Pix sequenciado | WhatsAppAuditor 16 testes | campo não validado | Piloto de campo (humano) |
| Recepcionista | ✅ SAFE_MENU para pedido e endereço solto | WhatsAppRealCaseDiagnostics, 115 tests | branch GPT não-determinístico | Aceitar UNKNOWN P1 ou cobrir KB |
| Host Diagnostic | ✅ existe, workflow OK | f1c90f9 + commit anterior | não rodou em campo | Rodar workflow antes do próximo piloto |
| Full Agent Diagnostic | ✅ 13 cenários, 24 testes, workflow OK | e85f398 + e91c6aa | não rodou em produção ainda | Rodar workflow (GitHub Actions) |
| WA Cockpit/Simulator | ✅ exists | WhatsAppTextOrderSimulator 14 tests | — | Em uso |
| Handoff | ✅ `falar com atendente` → HUMAN, IA para | A8-handoff scenario | — | Nenhuma |
| Pix/Pedido | ✅ apenas após confirmação, apenas `…223` | safety invariants nos testes | campo não validado | Piloto de campo |
| Field validation | ⏳ PENDENTE | zero evidência de campo real | P0 blocker para EXPAND | Diego agenda piloto |
| Atendimento badge | ✅ fix Multicanal (`take:5`) | f9968e5 | — | Nenhuma |
| WaiterBrainV2 | ⚠️ 26 falhas pré-existentes Sprint 4B/4D/4E/4F | vitest output | não afeta WhatsApp Agent | Separado — não tocar |

---

## 8. Backlog reconciliado

### ✅ Já feito e validado por testes

- Recepcionista: pedido explícito → SAFE_MENU (sem link gigante)
- Recepcionista: endereço solto → sem LOCATION, sem HANDOFF
- Recepcionista: handoff → HUMAN, IA para
- Host Routing Diagnostic (f1c90f9): cobre ambos caminhos
- Full Agent Diagnostic (e85f398 + e91c6aa): 13 cenários A1-A8/B1-B5, decisão operacional
- Workflow `whatsapp-full-agent-diagnostic.yml`: falha p0>0/safety
- Gated open-to-final-customers + rollback de 30s + live-monitoring (b9e53fa)
- Atendimento Multicanal badge (f9968e5)
- Cart recovery diagnostics, draft identity (sessão anterior)
- Cardápio timeline logging / metadata.source / labels IA · Cardápio (sessão anterior)

### ⏳ Parcial (implementado, sem validação de campo)

- Text Order allowlisted: comanda real + Pix real para `…223` — funciona em teoria, não testado em campo com cliente
- Recepcionista fora da allowlist: corrigido em código/testes, **nunca validado com número real não-allowlisted**
- Full Agent Diagnostic em produção: workflow criado, **nunca acionado via GitHub Actions**

### ❌ Falta (não implementado)

- Nenhum gap técnico identificado no HEAD atual

### 🔒 Bloqueado (decisão humana)

- **Expansão da allowlist**: Diego decide quais números adicionar
- **Piloto de campo fora-allowlist**: precisa de número real não-allowlisted enviando mensagem
- **Pedido de RESTAURANT_WIDE**: requer `fieldValidated=true` + brain director CR + todos os gates verdes
- **`fieldValidated=true` no workflow**: só Diego pode setar isso (input manual com confirmação)

---

## 9. Decisão operacional recomendada

**EXPAND_ALLOWLIST** (condicional a campo).

Critério atual:
- `p0=0` esperado (bateria local passa)
- `p1=0` provável (UNKNOWN no B3 e A7 é P1 aceito)
- Segurança: `noEvolution=true`, `noRealOrder=true`, `noRealPix=true`, `runtimeTouched=false`
- Campo: **NÃO validado**

→ Sistema recomenda adicionar 1-2 números confiáveis à allowlist para piloto controlado.
Cada expansão é decisão humana (painel ou SQL direto). Não abrir RESTAURANT_WIDE.

**Para subir para READY_FOR_RESTAURANT_WIDE_REQUEST:**
1. Rodar `whatsapp-full-agent-diagnostic.yml` em produção → `p0=0 && p1=0`
2. Piloto de campo: número real não-allowlisted recebe SAFE_MENU (confirmar no print/log)
3. Pedido real allowlisted ponta-a-ponta (comanda → CEP → frete → Pix após resumo)
4. Setar `fieldValidated=true` no workflow
5. Rodar gates de promoção (`request-restaurant-wide`)

---

## 10. Próximo prompt recomendado

```
P0 FIELD — Piloto de campo controlado (leitura + confirmação)

Trabalhe exclusivamente no branch: claude/remove-legacy-runner-q8iXa

NÃO implemente nada. NÃO altere WaiterBrainV2. NÃO mexa em CRM/Instagram.

MISSÃO:
1. Rodar workflow whatsapp-full-agent-diagnostic.yml via GitHub Actions (input: sushi-cazza, fieldValidated=false)
2. Capturar: status, p0, p1, recommendation, noEvolution, noRealOrder, noRealPix, runtimeTouched
3. Rodar workflow whatsapp-host-routing-diagnostic.yml com as mensagens dos casos reais
4. Reportar: qual SHA está em produção, p0, p1, recommendation
5. Se p0=0 e p1=0: emitir instruções exatas para Diego adicionar 1 número à allowlist para piloto
6. Se p0>0: identificar qual cenário falhou e propor fix específico

CRITÉRIO DE SUCESSO: relatório diz claramente se pode ou não expandir allowlist agora.
```

Ou, se Diego quiser só verificar o estado de produção sem GitHub Actions:
```bash
# Via CRON_SECRET direto:
curl -X POST "https://foocci.com.br/api/cron/whatsapp/full-agent-diagnostic" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"restaurantSlug":"sushi-cazza","fieldValidated":false}' | jq '{status:.summary.status,p0:.summary.p0,p1:.summary.p1,recommendation:.summary.recommendation,safety:.safety}'
```
