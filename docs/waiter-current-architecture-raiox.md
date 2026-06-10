# Waiter Department — Raio-X da Arquitetura Atual

> Auditoria read-only realizada em 2026-06-10 no branch `claude/remove-legacy-runner-q8iXa`.
> Nenhum código foi alterado nesta rodada. Este documento é a fotografia fiel do que
> está no código e na UI HOJE, para alinhar qualquer pessoa antes de nova alteração.

---

## 1. Visão geral

O Waiter Department é o "departamento" do agente Garçom dentro do admin
(`/admin/agents/waiter`), com 9 abas, e um conjunto de subsistemas desacoplados:

| Subsistema | Pasta principal | Toca o cliente real? |
|---|---|---|
| Runtime real (WaiterBrainV2) | `src/services/ai/` | **SIM** (`/pedido` + WhatsApp) |
| Agent Library | `src/services/agentLibrary/` | NÃO (conhecimento arquivado) |
| Runtime Merge / Library-Assisted | `src/services/waiterRuntime/` | Só via versão ACTIVE explícita |
| Simulation Lab | `src/services/simulation/` | NUNCA (SafeMode, dry-run) |
| Examples reais sanitizados | `src/services/simulation/examples/` | NUNCA (leitura + sanitização) |
| Quality Control | `src/services/quality/` | NUNCA (auditores read-only) |

Princípio central: **a Library nunca entra no prompt real por padrão**. Só entra
via uma `WaiterRuntimeVersion` ACTIVE em modo `LIBRARY_ASSISTED`, ativada por
humano, com Quality Gate (P0=0). Qualquer falha → fallback CURRENT.

## 2. Runtime real

```text
Runtime real atual: WaiterBrainV2 (via AIOrderService) — inalterado como motor principal
Library entra no runtime real? NÃO (por padrão; só via versão ACTIVE LIBRARY_ASSISTED)
Existe versão ativa real? NÃO (nenhuma versão ACTIVE para restaurante real)
CURRENT fallback seguro? SIM (bridge nunca lança; qualquer erro → CURRENT)
```

Cadeia de chamada do `/pedido`:

```
GET/POST /api/pedido/[slug]
  → AIOrderService.runWebTurn()
      → WaiterBrainV2.decide()            (motor determinístico; se requiresAI=false, nem chama LLM)
      → PromptBuilderService.buildForWeb() (prompt base — NÃO alterado para Library)
      → getWaiterRuntimeKnowledge()        (bridge: decide CURRENT vs LIBRARY_ASSISTED)
      → OpenAI (com tool definitions)
```

- `WaiterBrainV2` (`src/services/ai/WaiterBrainV2.ts`) continua o runtime principal.
- `PromptBuilderService` NÃO foi alterado; a injeção de Library é um **addendum**
  condicional no `AIOrderService` (web linha ~345 e WhatsApp ~742): só se
  `libraryKnowledge.enabled && promptBlock`.
- Bridge: `src/services/waiterRuntime/WaiterLibraryRuntimeBridge.ts` —
  default `{enabled:false, mode:"CURRENT", promptBlock:""}`; nunca lança
  (catch → `safeFallback`). Escopo: versão do restaurante vence a global.
- **Não existem env-flags** para isso: a governança é 100% por banco
  (`WaiterRuntimeVersion.isActive/mode/libraryEnabled` + técnica `ACTIVE/runtimeEnabled`).
- Nenhum caminho de ativação automática existe (sem cron/webhook que ative versão).

## 3. Agent Library

Modelos Prisma (migrations `20260606`, `20260607`, `20260609010000`):
`AgentLibrarySource` (status DRAFT/ACTIVE/ARCHIVED; extractionStatus PENDING…READY),
`AgentLibraryFile` (binário privado 1:1), `AgentLibraryTechnique`
(status EXTRACTED/IN_REVIEW/ACTIVE/ARCHIVED/REJECTED; `runtimeEnabled` default **false**
no schema; `runtimePriority` default 0), `AgentLibraryExtractionJob` (deep, com stages),
`AgentLibrarySourceChunk`, `AgentLibraryChunkTechniqueCandidate`.

Fluxo de upload (`uploadFlow.ts` + `/api/admin/agents/library/upload`):
1. valida arquivo → 2. cria source primeiro (nunca perde upload) → 3. parse PDF/TXT/MD →
4. extração automática: **quick** (texto pequeno, 1 chamada gpt-4o-mini) ou
**deep** (≥ ~40KB: chunking + job em background) → 5. técnicas criadas.

- **Novas técnicas nascem ACTIVE + runtimeEnabled=true + priority 50**
  (`agentLibraryHelpers.newTechniqueActivationDefaults()`, approvedBy="source-upload").
  Técnicas antigas NÃO são retro-alteradas (sem backfill que mude as existentes).
- **Library NÃO impacta o runtime automaticamente** — mesmo ACTIVE/runtimeEnabled,
  a técnica só chega ao prompt se congelada numa versão ACTIVE LIBRARY_ASSISTED.
- Deep extraction roda em background via
  `POST /api/cron/agent-library/process` (Bearer CRON_SECRET), agendado
  **a cada 5 min** (`agent-library-process.yml`); processa N chunks por chamada e
  consolida (dedup) ao final.
- Diagnósticos: auto-extraction test (admin) e deep diagnostic cron-safe
  (`/api/cron/agent-library/deep-diagnostic` + workflow manual
  `agent-library-deep-diagnostic.yml`) — ciclo sintético com cleanup;
  **PASS em produção** nas entregas anteriores.

## 4. Runtime Merge / Library-Assisted

Modelos: `WaiterRuntimeVersion` (status **DRAFT/TESTING/ACTIVE/ROLLED_BACK/ARCHIVED**;
mode CURRENT|LIBRARY_ASSISTED; `isActive` único por escopo; `libraryEnabled`;
`maxTechniques`; policy PRIORITY_DESC) e `WaiterRuntimeVersionTechnique`
(**snapshot congelado** — editar a Library depois não muda versão ativa).

Ciclo (`WaiterRuntimeVersionService.ts`):
- `createDraft()` → nasce **DRAFT** (nunca visível ao cliente), técnicas congeladas;
- `markTesting()` → TESTING (ainda invisível);
- `activateVersion()` → roda **Quality Gate** (`qualityGate.ts`: Waiter Auditor em
  SafeMode; **bloqueia se P0 > 0**); se passa: demove outra ACTIVE do escopo →
  ARCHIVED e ativa esta; snapshot do gate gravado na versão;
- `rollbackVersion()` → **instantâneo, sem gate** (voltar à segurança é rápido):
  ACTIVE → ROLLED_BACK; restaura versão anterior ou cai em CURRENT.

Diagnóstico cron-safe: `POST /api/cron/waiter-runtime/merge-diagnostic`
(+ workflow manual `waiter-runtime-merge-diagnostic.yml`) — ciclo sintético completo
(criar técnica → versão → gate → ativar → bridge → rollback → cleanup) num
restaurantId fake; valida `runtimeTouched=false`; **PASS em produção**.

**Nenhuma versão real está ativa.** Ativação exige ação humana via API admin
(`POST /api/admin/agents/waiter/runtime/versions/[id]`) protegida por ADMIN_SECRET.

## 5. Simulation Lab

Núcleo genérico (`src/services/simulation/`): `AgentSimulationService` (orquestrador
puro, agent-agnóstico), `SimulationSafeMode` (contrato imutável: dry-run, sem
side-effects/pagamento/mensagem/pedido — lança `SimulationSafetyError` se violado),
`scenarioGenerator` (RNG semeado mulberry32 + seed diária), `simulationEvaluator`
(PASS/WARNING/FAIL + P0/P1/P2), `opportunityBuilder` (toda oportunidade nasce
**PENDING_REVIEW** — nunca auto-aplica), `simulationSanitizer` (máscara de PII),
`SimulationStore` (tabelas próprias `agent_simulation_*`), `cockpitModel`.

Adapter Waiter (`simulation/waiter/`): 37 templates de cenário, catálogo sintético,
roda `WaiterBrainV2.decide()` de verdade — mas só em dados sintéticos.

Automação: `POST /api/cron/agents/waiter/simulation/run` agendado **diário 06:45 UTC
(~03:45 BRT)** via `waiter-simulation-run.yml` (12 cenários/dia; o workflow FALHA se
status≠PASS, p0Count>0 ou runtimeTouched≠false). Execução manual também existe.

UI: tudo centralizado na aba **Simulador** (`WaiterSimulationLab.tsx`) — status da
automação, rodar manualmente, fila de oportunidades (aprovar/rejeitar/backlog via
`PATCH /opportunities/[id]`), exemplos reais (extração + aprovação), histórico,
badge "Seguro · runtime real intocado". Nada de simulação espalhado em outras abas.

`runtimeTouched` é **sempre false** — hardcoded em 8 pontos (tipo literal readonly,
serviço, store, cockpit, diagnóstico, crons) + assert de SafeMode em toda execução.

## 6. Exemplos reais sanitizados

- `SimulationExampleExtractor` lê Conversation/Message **somente leitura**, sanitiza
  cada turno ANTES de persistir (raw nunca é salvo) e cria exemplo **PENDING_REVIEW**.
- Sanitizer mascara: email, telefone BR, CPF, CNPJ, endereço, nome, nº de pedido,
  tokens/secrets, sequências longas de dígitos.
- **Aprovação humana existe**: operador marca APPROVED/REJECTED/BACKLOGGED na aba
  Simulador; só exemplos APPROVED alimentam o generator.
- Influência no generator é **estrutural** (intent + scenarioType): a frase do cenário
  vem do pool de templates. **Texto literal é copiado? NÃO. PII vaza? NÃO.**
- Diagnóstico E2E (`examplesDiagnostic` + workflow manual
  `waiter-simulation-examples-diagnostic.yml`): PII sintética → sanitiza → aprova →
  gera cenário inspirado → valida literalLeak=false, piiLeak=false, p0=0, cleanup —
  **PASS em produção**.

## 7. Quality Control

- Dashboard: `/admin/quality` (resumo executivo, findings, drill-down por auditor,
  tendência/regressão, alertas internos, export JSON/TXT).
- 4 auditores read-only: **Waiter** (37 cenários), **CRM** (46, LLM dry-run),
  **Analytics** (25, fixtures), **WhatsApp** (21, fixtures; PIX nunca real).
- `runAll()` em `QualityControlService`; persistência em `quality_audit_run/finding`;
  `detectRegression()` compara execuções; `deriveInternalAlerts()` gera alertas
  visuais (NEW_P0, STATUS_REGRESSION, P0_RESOLVED) — **sem envio externo**.
- Cron diário 06:30 UTC (03:30 BRT) via `quality-audit-cron.yml`; última execução
  agendada conhecida (2026-06-09) = **success**.
- Status: **Waiter Auditor P0=0; runAll P0=0** nas últimas execuções conhecidas.
- Warning conhecido (documentado em `quality-control.md`): 1 WARNING funcional do
  WhatsApp Auditor (cenário full-add-item) — **não bloqueia**; backlog declarado.

## 8. Workflows / crons (relevantes ao Waiter)

| Workflow | Arquivo | Quando | Endpoint | Secret | Último resultado conhecido |
|---|---|---|---|---|---|
| Quality Audit Cron | `quality-audit-cron.yml` | diário 06:30 UTC + manual | `POST /api/cron/quality/run` | CRON_SECRET | success (2026-06-09, agendado) |
| Agent Library Process | `agent-library-process.yml` | **a cada 5 min** + manual | `POST /api/cron/agent-library/process` | CRON_SECRET | rodando em produção |
| Agent Library Deep Diagnostic | `agent-library-deep-diagnostic.yml` | manual | `POST /api/cron/agent-library/deep-diagnostic` | CRON_SECRET | PASS em produção |
| Agent Library Auto-Extraction Test | `agent-library-auto-extraction-test.yml` | manual | rota admin de diagnóstico | ADMIN (diagnóstico) | PASS |
| Waiter Runtime Merge Diagnostic | `waiter-runtime-merge-diagnostic.yml` | manual | `POST /api/cron/waiter-runtime/merge-diagnostic` | CRON_SECRET | PASS em produção (P0=0, runtimeTouched=false) |
| Waiter Simulation Run | `waiter-simulation-run.yml` | diário 06:45 UTC + manual | `POST /api/cron/agents/waiter/simulation/run` | CRON_SECRET | PASS (falha se P0>0) |
| Waiter Simulation Examples Diagnostic | `waiter-simulation-examples-diagnostic.yml` | manual | `POST /api/cron/agents/waiter/simulation/examples-diagnostic` | CRON_SECRET | PASS em produção |

(Outros workflows do repo — `crm-*`, `railway-deploy` — não são do Waiter.)

## 9. UI / UX do Waiter Room

`/admin/agents/waiter` → `WaiterRoom.tsx`, 9 abas pill-based, deep-linkáveis:

| Aba | Conteúdo | Avaliação |
|---|---|---|
| Dashboard | resumo executivo, KPIs honestos, próximos passos | **claro** |
| Perfil | identidade do agente, componentes | **claro** |
| Operação | fluxo 1–6, responsabilidades | **claro** |
| Brain & Skills | motor de decisão, skills, regras | **claro** |
| Library | `AgentLibraryPanel` (upload → extração automática → técnicas) | **claro/simples** |
| Runtime & Testes | tabela de componentes, Test Center, cobertura | **claro** (ponte p/ página de testes separada) |
| Runtime Merge | `WaiterRuntimeCockpit` (versões, curadoria, gate, rollback) | **claro, porém técnico** (aceitável: aba de governança) |
| Simulador | `WaiterSimulationLab` (tudo de simulação centralizado) | **claro** |
| Governança | mapa de risco, backlog P0/P1/P2, garantias de rollback | **útil** (referência) |

- **Sem duplicação**: Library/Simulador/Runtime Merge existem em UMA aba cada;
  componentes repetidos entre Perfil/Operação/Brain são filtragens intencionais.
- Sem stores globais (Zustand/Redux): estado local React por componente.
- Salvaguardas visíveis: badge "Runtime DB: desligado", "Ativar (gate)" bloqueia
  com P0, rollback explicitamente sem gate.
- Melhorias apontadas (P1/P2, não nesta rodada): modal de confirmação no botão
  Ativar/Rollback do cockpit; help-text no fluxo de oportunidades.

## 10. Riscos

**P0 — nenhum.**
- Nenhuma versão Library-Assisted ativa para restaurante real; default CURRENT.
- Técnica não entra no prompt sem versão ACTIVE + gate; bridge com fallback seguro.
- Simulação/auditores/diagnósticos: read-only, runtimeTouched=false, P0=0.
- Pedido/Pix/WhatsApp intocados por todos esses subsistemas.

**P1 — importantes (não bloqueiam):**
1. Cockpit visual (Runtime Merge/Simulador) ainda não validado com operador real
   em navegador (auditoria foi por código; sem teste Playwright).
2. Nenhuma versão Library-Assisted testada em piloto controlado (TESTING num
   restaurante de teste) — o ciclo só foi provado sinteticamente.
3. Oportunidades de simulação pendentes podem acumular sem rotina de revisão.
4. Exemplos reais extraídos pendentes de aprovação podem acumular.
5. Técnicas antigas (pré-default ACTIVE) não foram normalizadas — convivem
   estados heterogêneos na Library (informativo; não afeta runtime).
6. Falta modal de confirmação em Ativar/Rollback no cockpit.
7. WARNING funcional conhecido no WhatsApp Auditor (full-add-item) a limpar.

**P2 — melhorias futuras:**
Playwright/teste de UI real; AI Scenario Generator; ranking de técnicas por
desempenho; A/B test de versões; métricas de impacto pós-ativação; alertas
externos opt-in (e-mail/WhatsApp do operador).

## 11. Pendências

- Revisar fila de oportunidades + exemplos pendentes (humano).
- Decidir quando rodar o primeiro piloto Library-Assisted (restaurante de teste).
- UX: confirmações no cockpit; help-text de oportunidades.
- Limpar o WARNING do WhatsApp Auditor.

## 12. O que NÃO está ativo em produção

- ❌ Nenhuma `WaiterRuntimeVersion` ACTIVE para restaurante real (modo real = CURRENT).
- ❌ Nenhuma técnica da Library no prompt real.
- ❌ Nenhum envio externo de alertas (Quality alerts são visuais).
- ❌ Simulação nunca cria pedido/Pix/WhatsApp (SafeMode bloqueia por contrato).
- ❌ Oportunidades/Exemplos não se auto-aplicam — sempre exigem humano.

## 13. Checklist antes de QUALQUER nova alteração

1. `git branch --show-current` = `claude/remove-legacy-runner-q8iXa`; `git pull --rebase`.
2. `npx prisma generate` (cliente Prisma fica obsoleto após rebase!).
3. `npx tsc --noEmit` limpo ANTES de começar.
4. Confirmar que a mudança não toca: checkout, Pix/MercadoPago, Evolution/WhatsApp,
   WaiterBrainV2/PromptBuilder (salvo missão explícita).
5. Se mexer em Library/Merge/Simulação: manter defaults seguros (dry-run,
   PENDING_REVIEW, CURRENT fallback) e `runtimeTouched=false`.
6. Suites mínimas: `agents`, `agentLibrary`, `waiterRuntime`, `simulation`,
   `quality`, `order` + `npm run build`.
7. Workflows novos: CRON_SECRET (não ADMIN_SECRET), POST-only, logs sem PII,
   dry-run por padrão.

## 14. Validações desta auditoria (2026-06-10)

| Validação | Resultado |
|---|---|
| `npx prisma generate` | OK |
| `npx prisma validate` | OK ("schema is valid") |
| `npx tsc --noEmit` | exit 0 |
| `vitest src/services/agents` + `agentLibrary` | 16 files, **114 passed** |
| `vitest src/services/simulation` + `quality` | 20 files, **176 passed** |
| `vitest src/services/order` | 6 files, **69 passed** |
| `vitest src/services/waiterRuntime` (extra) | 6 files, **33 passed** |
| `npm run build` | exit 0 (compilado com sucesso) |

Nenhuma falha nova; nenhuma falha pré-existente observada nas suítes acima.
