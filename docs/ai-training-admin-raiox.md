# Raio-X — Admin "Treinamento IA" (AI Training)

> Branch `claude/remove-legacy-runner-q8iXa` · 2026-06-11 · **somente auditoria/doc — nenhum código alterado.**
> Objetivo: descobrir exatamente o que é a área "Treinamento IA", se funciona, e como
> se relaciona com Foocci Brain, Agent Simulation Lab, Waiter Training Center, WA
> Cockpit, WhatsApp Text Order, Quality, Library e Evidence.

## 1. Resumo executivo

A tela **Treinamento IA** (`/admin/agentes/training`) **existe, está completa e
funciona**. É a fonte do **loop de treinamento contínuo 24h** do agente de pedido
por WhatsApp: captura falhas reais, gera/roda cenários na máquina real (dry-run),
avalia com GPT-4o (9 dimensões), gera **propostas de melhoria** e mantém uma **fila
de aprovação humana**. **Aprovar nunca aplica em produção** — no máximo cria uma
versão **SANDBOX**; `autoApplyProduction` é travado em `false` e `APPLIED_TO_PRODUCTION`
está fora das transições permitidas na v1.

A descoberta estrutural mais importante **não é** um problema na tela, e sim
**duplicação no ecossistema**: existem hoje **três sistemas de simulação/treino**
paralelos e **quatro superfícies distintas de "oportunidade/aprovação"**, sem fonte
única. Isso é P1 (organização), não P0 (segurança).

## 2. Onde fica

- **Página:** `src/app/admin/(area)/agentes/training/page.tsx` (~2.4k linhas, 7 abas).
- **Menu:** `AdminSidebar.tsx` → `{ href: "/admin/agentes/training", label: "Treinamento IA", icon: "🧠" }`.
- **APIs admin:** `src/app/api/admin/training/**` (21 rotas: dashboard, runs, scenarios,
  proposals, arena, validate-cycle, brain-versions, config, setup-check, trigger/*, backfill-proposals).
- **Crons:** `src/app/api/cron/agent-training/{run-small-batch, mine-real-conversations, process-backlog, run-nightly}`.
- **Serviços:** `src/services/agent-training/{RunnerService, EvaluatorService, ImprovementService, ScenarioGenerator, ConversationMiner, types}`.
- **Modelos Prisma:** `agent_training_runs`, `agent_training_scenarios`, `agent_training_evaluations`,
  `agent_improvement_proposals`, `agent_brain_versions`, `agent_training_configs` (schema.prisma ~3284–3438).
- **Workflow:** `.github/workflows/agent-training-cron.yml`.

> Observação de navegação (P2): a tela vive em `/admin/**agentes**/training` (português),
> enquanto o WA Cockpit vive em `/admin/**agents**/whatsapp` (inglês). Prefixos
> inconsistentes — fonte de confusão para descobrir as telas.

## 3. Arquitetura atual

Loop fechado de auto-melhoria (auto-treina, **não** auto-publica):

```
captura de falha real (mineração) ─┐
cenários gerados por IA ───────────┤→ runBatch (máquina real, allowSideEffects=false)
                                   │→ avaliação GPT-4o (9 scores, verdict PASS/WARN/FAIL)
                                   │→ proposta (AgentImprovementProposal, PENDING_APPROVAL)
                                   │→ fila de aprovação humana (aba "Melhorias para Aprovar")
                                   └→ aprovar p/ SANDBOX (AgentBrainVersion status=SANDBOX)
                                      └→ PRODUÇÃO: bloqueada na v1
```

Gates de segurança no código (não só no workflow):
- `allowSideEffects: false` fixo no runner (nenhum WhatsApp/pedido/Pix).
- `autoApplyProduction` forçado `false` no `config/route.ts`.
- `APPLIED_TO_PRODUCTION` fora de `ALLOWED_STATUS_TRANSITIONS` em `proposals/[id]/route.ts`.
- Mineração de conversas é read-only com mascaramento de PII.

## 4. Fluxo da tela (7 abas)

1. **Visão Geral** — dashboard (atualiza a cada 30s), banner "treina sozinho, mas não
   publica sozinho", backlog de falhas, e 3 botões: *Batch pequeno agora* (`POST /runs`),
   *Batch noturno agora* (`POST /trigger/nightly`), *Minerar conversas* (`POST /trigger/mine`).
2. **Arena** — 6 cenários preset rodados na máquina real (`POST /arena/run`), janela de
   chat, checagem de violação de safety; lista **casos reais** com *Rodar / Gerar diagnóstico / Criar proposta*.
3. **Casos** — casos reais, cenários IA e histórico de runs (com modais de detalhe).
4. **Melhorias para Aprovar** — fila de `AgentImprovementProposal`; filtros por status;
   `Aprovar / Sandbox / Rejeitar / Pedir ajuste / Resolvido manualmente`.
5. **Versões** — histórico de `AgentBrainVersion` (DRAFT/SANDBOX/ACTIVE/ARCHIVED); aviso "produção bloqueada".
6. **Validação** — `POST /validate-cycle`: roda 10 cenários, avalia o caso de preço,
   gera diagnóstico+proposta e devolve um relatório com checklist de safety.
7. **Configurações** — toggles do loop (continuous, mining, auto-propose, nightly…),
   limites numéricos, `autoApplyProduction` travado, e checklist de setup de cron.

O que é **real**: tudo acima persiste no Prisma (runs, scenarios, evaluations, proposals,
versions, config). O que é **local/efêmero**: seleção de aba, playback da Arena, flags de loading.

## 5. APIs / services usados

- **Leitura (sem escrita):** dashboard, config GET, runs GET, scenarios GET, proposals GET,
  brain-versions, setup-check GET, arena/real-cases, scenarios/problems.
- **Escrita:** runs POST (cria run + roda batch), scenarios/{id}/evaluate (GPT-4o), .../proposal,
  proposals/{id} PATCH (status; cria AgentBrainVersion no SANDBOX), proposals/grouped,
  backfill-proposals, arena/run, validate-cycle, config PATCH, trigger/nightly, trigger/mine.
- **Auth:** todas as rotas admin via `checkAdminRequest` (ADMIN_SECRET/cookie); crons via `CRON_SECRET`.
- **Serviços:** `AgentTrainingRunnerService` (createRun/runScenario/runBatch/finalizeRun, `allowSideEffects:false`),
  `AgentTrainingEvaluatorService` (GPT-4o), `AgentTrainingImprovementService` (generateProposal/backfill),
  `AgentTrainingScenarioGenerator`, `AgentTrainingConversationMiner` (mask PII + mineração read-only).

## 6. Automação 24h

**Sim, roda sozinho.** `agent-training-cron.yml`:
- `*/30 * * * *` (a cada 30 min): `run-small-batch` (10 cenários IA), `mine-real-conversations`
  (captura falhas reais), `process-backlog` (avalia WARN/FAIL pendentes, janela de 7 dias, máx 15).
- `0 7 * * *` (diário, 04:00 BRT): `run-nightly` (30 cenários IA+reais, avaliação completa, propostas agrupadas).
- Todos exigem `Authorization: Bearer CRON_SECRET`. Salvam no Prisma. Geram propostas
  automaticamente (status PENDING_APPROVAL). **Não** notificam ninguém ativamente (a fila
  é "pull": o Diego abre a aba). **Não** dependem de botão (mas há botões para rodar na hora).
- **Risco de tocar cliente real:** nenhum encontrado — `allowSideEffects:false`, sem envio
  Evolution, sem pedido/Pix; mineração read-only com PII mascarada.

## 7. Oportunidades / relatórios / aprovação

- **Oportunidades/sugestões:** sim — `AgentImprovementProposal` (problema, causa raiz, tipo de
  mudança, patch proposto, risco LOW/MEDIUM/HIGH, impacto esperado, before/after score).
- **Relatórios:** dashboard + `validate-cycle` (relatório estruturado com checklist de safety) +
  `runs/{id}/report`.
- **Fila de aprovação:** sim, na aba "Melhorias para Aprovar".
  - **Aprovar** → status `APPROVED` (+ approvedBy/approvedAt); **não** cria versão, **não** toca runtime.
  - **Sandbox** → `APPLIED_TO_SANDBOX` + cria `AgentBrainVersion` status=SANDBOX (isolado).
  - **Rejeitar** → `REJECTED`. **Pedir ajuste** → `NEEDS_REVISION` (+ reviewerNotes). **Resolvido manualmente** → fecha.
  - **Aprovar muda runtime?** Não. **Cria Change Request (Brain)?** Não — cria AgentBrainVersion,
    **não** `BrainChangeRequest`. **Alimenta Library/Brain?** Não automaticamente.
  - **Rastreabilidade:** sim — proposta ↔ run ↔ scenarios ↔ evaluations ↔ brainVersion (sourceProposalId).

## 8. Relação com Foocci Brain

**PARCIAL.**
- **Conectado:** existe `src/services/brain/training/BrainTrainingContract.ts` (contrato de integração);
  o Treinamento cria `AgentBrainVersion` (candidato de "brain" por agente).
- **Falta:** o Treinamento **não** usa o **Brain Director** nem cria **`BrainChangeRequest`**;
  não passa pelo Engine Router / Knowledge / Reasoning / Quality Gate / Evidence do Brain.
- **O que deveria virar Brain-level:** a **governança de mudança** (fila única de aprovação +
  ledger de change requests + quem aprovou/aplicou) e o **gate de produção**.
- **O que deveria ficar por agente:** os **cenários/arena** e a **avaliação** específicos
  (WhatsApp Text Order, recepcionista, waiter, CRM…).

## 9. Relação com Agent Simulation Lab

Há **três pilhas distintas** de simulação/treino — esta é a duplicação central:

| Sistema | Modelos | Rotas | Cron/Workflow | Aprovação |
|---|---|---|---|---|
| **Treinamento IA** (agent-training) | `agent_training_runs/scenarios/evaluations`, `agent_improvement_proposals`, `agent_brain_versions` | `/api/admin/training/**` | `agent-training-cron.yml` (30min + nightly) | `AgentImprovementProposal` |
| **Agent Simulation Lab** (simulation) | `agent_simulation_runs/scenarios/opportunities/examples` | `/api/admin/agents/waiter/simulation/**` | `waiter-simulation-run.yml` (agendado) | `AgentSimulationOpportunity` |
| **Waiter Training Center** (waiterTraining) | `waiter_training_suggestions` | `/api/admin/agents/waiter/training-suggestions` | `waiter-training-*.yml` | `WaiterTrainingSuggestion` |

Respostas: (1) **Não** — o Treinamento IA roda pela própria pilha (agent-training +
`processCustomerMessage`), não pelo Simulation Lab. (2) O **WA Cockpit é separado** (e
não persiste). (3) O **Waiter Training Center é separado**. (4) **Não há fonte única de
oportunidades** (são 4: AgentImprovementProposal, AgentSimulationOpportunity,
WaiterTrainingSuggestion, BrainChangeRequest). (5) **Não há fila única de aprovação**.
(6) **Sim, há simuladores duplicados** (3 pilhas + o WA Cockpit hermético).

## 10. Relação com WhatsApp Text Order

- O **Treinamento IA já testa o WhatsApp Text Order**: o runner roda `processCustomerMessage`
  (a mesma máquina) em `allowSideEffects:false`. A Arena tem cenários de pedido.
- **Mas** ele **não** consome o **WA Cockpit** (`WhatsAppTextOrderSimulatorService`), que é
  hermético, sintético, com transcript/comanda/`WOULD_CREATE_ORDER`/`WOULD_GENERATE_PIX`/safety —
  e **não persiste** nem gera proposta.
- Conclusão: são complementares. O WA Cockpit é o **arena hermético do WhatsApp**; o
  Treinamento IA é o **loop de captura→avaliação→proposta→aprovação**. Hoje vivem separados.

## 11. Duplicações encontradas

- **3 pilhas de simulação/treino** (agent-training, simulation, waiterTraining) + **WA Cockpit**.
- **4 superfícies de oportunidade/aprovação** sem fonte única.
- **2 prefixos de rota** divergentes (`/admin/agentes/**` vs `/admin/agents/**`).
- Mesma "máquina" (`processCustomerMessage`) chamada por agent-training, WA Cockpit e
  auditoria de Quality — três caminhos para a mesma simulação.

## 12. Riscos

**P0 (nenhum encontrado):** não há envio de WhatsApp/Evolution, criação de pedido, geração
de Pix, toque em cliente real, nem aprovação que entra em produção automaticamente —
todos bloqueados por código (`allowSideEffects:false`, `autoApplyProduction:false`,
`APPLIED_TO_PRODUCTION` proibido). *Recomenda-se reconfirmar periodicamente o mascaramento
de PII no `ConversationMiner` e que os crons nunca enviem.*

**P1:** duplicação de simuladores; oportunidades espalhadas em 4 tabelas; sem fila única de
aprovação; WA Cockpit não persiste (sem histórico/oportunidade); Treinamento IA não cria
`BrainChangeRequest` (governança fora do Brain Director); risco de "aprovação confusa" por
haver vários lugares para aprovar coisas diferentes.

**P2:** prefixos de rota inconsistentes (`agentes` vs `agents`); naming (Treinamento IA /
Agent Training / Simulation Lab / Cockpit); cópia/labels; descoberta das telas.

## 13. Recomendação de arquitetura

**Híbrido B + C (não implementar agora):**
- **Treinamento IA vira o guarda-chuva** (Opção B) de todos os simuladores/treinos por
  agente (WhatsApp Text Order, recepcionista, waiter, CRM…), com **uma aba/arena por agente**.
  O **WA Cockpit** entra como a **arena hermética do WhatsApp** dentro dele (uma aba/fonte de
  cenários), parando de ser uma tela paralela.
- **Governança sob o Foocci Brain** (Opção C): unificar as 4 superfícies de oportunidade numa
  **fila única** e fazer "Aprovar" gerar **`BrainChangeRequest`** (ledger único, com Brain
  Director). Mantém o gate de produção do Brain.
- **Manter separado (Opção A)** só onde fizer sentido técnico (ex.: a máquina pura por agente).
- **Descontinuar (Opção D):** nada agora — documentar candidatos a convergência
  (AgentSimulationOpportunity vs AgentImprovementProposal vs WaiterTrainingSuggestion).

Justificativa: o Treinamento IA já é o sistema mais completo (loop 24h + avaliação + fila +
sandbox + lock de produção). Em vez de criar um novo cockpit, **convergir** os demais para
ele e para a governança do Brain elimina a duplicação sem reescrever o que já funciona.

## 13b. Atualização (Production Closure v1)

O primeiro passo da convergência foi feito: a aba **Arena** do Treinamento IA
agora exibe o card **"WhatsApp · Pedido por Texto"** apontando para o WA Cockpit
(`/admin/agents/whatsapp`) — *"Arena segura para validar o anotador de pedido sem
enviar WhatsApp, sem criar pedido e sem gerar Pix."* (link via
`src/services/agent-training/arenas.ts`, sem duplicar lógica nem tocar crons).
Além disso, a abertura de RESTAURANT_WIDE do WhatsApp agora passa pelo **Brain
Director** (`request-restaurant-wide` cria `BrainChangeRequest` CRITICAL/PRODUCTION
pendente de aprovação humana) — primeira frente usando a fila única de governança.

## 14. Próximo prompt sugerido

> "Unificar a governança de melhoria de agentes sob o Foocci Brain: (1) fazer a aprovação do
> Treinamento IA criar um `BrainChangeRequest` (fila/ledger único, Brain Director), preservando
> o gate de produção e o SANDBOX; (2) incorporar o WA Cockpit como a arena hermética do
> WhatsApp dentro do Treinamento IA (aba por agente), sem duplicar simulador; (3) mapear a
> convergência de `AgentSimulationOpportunity` + `WaiterTrainingSuggestion` para a fila única —
> sem alterar runtime, sem aplicar em produção, com testes e raio-X de migração."
