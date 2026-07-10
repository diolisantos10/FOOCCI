# FOOCCI Brain — Roadmap Universal (6/10 → 10/10)

> **A tese:** o corpo muda, o cérebro fica. Este roadmap leva o Brain de
> "cérebro de restaurante com nomes universais" a um **produto replicável** —
> uma arquitetura de operação capaz de operar qualquer empresa trocando só
> adapters e dados, nunca o núcleo.
>
> Criado em 2026-07-10 a partir de auditoria profunda do código (7 subsistemas,
> 3 propostas de arquitetura independentes sintetizadas). Todo achado citado
> aqui foi **verificado no código**, não em documentação.

> ## ⚖️ DIRETRIZ DO CEO (2026-07-10) — leia antes de executar qualquer fase
>
> **O plano principal é o FOOCCI**: torná-lo o produto mais cobiçado do mercado
> de restaurantes. **Universalidade é um PRINCÍPIO DE CONSTRUÇÃO, não uma fase
> de execução**: tudo nasce com contratos genéricos, adapters e config-em-vez-
> de-código (o olhar "isso será universalizado"), mas **NÃO haverá piloto de
> segundo vertical tão cedo**. O exemplo da clínica de estética citado neste
> documento é apenas ilustrativo — esse assunto só volta à mesa quando o FOOCCI
> estiver faturando milhões. Até lá, a Fase 6 fica **ESTACIONADA** (vale como
> guia de fronteiras arquiteturais, não como trabalho a puxar), e a prioridade
> é a excelência do produto restaurante: raciocínio vivo impecável, loop de
> aprendizado fechado, CRM inteligente, qualidade contínua.

---

## 0. STATUS DE EXECUÇÃO (2026-07-10, fim do dia)

| Fase | Status | Entrega |
|---|---|---|
| Fase 0 — Vitórias rápidas | ✅ ENTREGUE | CI real, registry, snapshot fact-level, janela de conversa, aprendizados vivos, shadow, caso rodízio, ESLint+teste arquitetural |
| Fase 1 — Alicerce | ✅ ENTREGUE | BusinessType aberto, perfis DB-first, contratos no caminho |
| Fase 2 — Verdade + memória | ✅ ENTREGUE | Crítico claim-vs-snapshot, retrieval por relevância, asOf/completude |
| Fase 3 — Raciocínio vivo governado | ✅ CONSTRUÍDA (desligada) | Escada SHADOW→ALLOWLIST→WIDE, gates c/ evidência de sombra, Applier, rollback 30s, API admin. Produção segue SHADOW_ONLY até promoção humana |
| Fase 4 — Multi-piloto | ✅ ENTREGUE | Claude+Gemini executáveis, roteamento persistido governado, 3 bypasses migrados (lista congelada 16→13) |
| Fase 5 — Loop de aprendizado | 🟡 PARCIAL | Gate registry, evidência de sombra persistida, auto-file de CR em novo P0. Falta: consolidar 6 filas, avaliar candidato, LLM-judge online |
| Fase 6 — Universalização provada | ⏸️ ESTACIONADA | Por diretriz do CEO — princípio de construção, não execução |

**Como ligar o raciocínio vivo quando a evidência chegar:**
`GET /api/admin/brain/free-form?restaurantId=…` mostra gates + estatística de
sombra; `POST action:promote-allowlist` (exige ≥20 amostras LLM c/ coerência
PASS ≥70%, golden set p0=0, verdade ≥0.6, confirm); depois `promote-wide`
(≥100 amostras, PASS ≥85%, acknowledge + CR CRITICAL). `action:rollback` volta
a SHADOW_ONLY em 30s.

---

## 1. Diagnóstico honesto (o ponto de partida)

O Brain já possui **todos os ativos arquiteturais difíceis**:

- Portão único de raciocínio (`reasonAsAgent`, `BrainReasoner.ts`) com fluxo
  ESCOPO → VERDADE → PILOTO → COERÊNCIA e fallback que nunca inventa;
- Contrato de segurança congelado (`BRAIN_SAFETY`) testado;
- Governança persistente com aprovação exclusivamente humana
  (`PersistentBrainDirectorService`);
- Contratos genéricos: `BusinessKnowledgeAdapter`, `AgentProfileDefinition`,
  `BrainChangeRequest`, quality/training/evidence;
- Escada de rollout com gates P0=0 e rollback de 30s (Text Ordering).

Mas **quase nada disso está sustentando peso hoje**:

| # | Achado (verificado) | Onde |
|---|---|---|
| 1 | O único caminho LLM vivo está morto por `const` hardcoded | `ALLOW_BRAIN_FREE_FORM = false` — `WhatsAppBrainRuntimeService.ts:40` |
| 2 | A "verdade" é contagem, não fato — causa-raiz do incidente rodízio | `RestaurantKnowledgeAdapter` retorna `products:[{menuItems: N}]`, sem nomes/preços |
| 3 | `knowledgeBlock()` descarta 5 das 10 chaves de truthSources | `BrainReasoner.ts:64-75` |
| 4 | Zero memória de conversa — o Brain vê 1 frase | `findFirst` da última mensagem; `sanitizedConversation: null` no adapter |
| 5 | O pool de aprendizados aprovados tem **zero consumidores** | `listApprovedLearningsForBrain` — nenhum caller em `src/` |
| 6 | Aprovar um ChangeRequest **não aplica nada** | `markApplied`/`markRolledBack` sem callers; sem executor |
| 7 | Só OpenAI pensa de verdade; CLAUDE/GEMINI lançam erro | `OpenAIEngineAdapter.ts:27-29`; sem SDK Anthropic/Gemini no `package.json` |
| 8 | 4 caminhos de LLM contornam o Engine Router | `WaiterReasoningLLMService` (gpt-4o-mini hardcoded), `WhatsAppOrderBrain`, `MessageVariationService`, `AnalyticsAgentService` |
| 9 | O núcleo importa o vertical por if-statement | `BrainReasoner.loadKnowledge` — `if (businessType === "RESTAURANT")`; outros = snapshot vazio |
| 10 | Coerência é um stub que aprova quase tudo | `coherenceOf()` hardcoda `doesNotInventFacts: true` |
| 11 | Não existe CI — a Regra de Ouro dente #2 não está implementada | `railway-deploy.yml` só deploya; nenhum teste roda em PR |
| 12 | Fragmentação de treino: ~9 sistemas, ~6 filas, 4-5 miners | auditoria própria em `docs/agent-simulators-audit-and-cleanup-plan.md` |
| 13 | Governança contornável: `openRestaurantWide` executa e registra CR depois; `reviewedBy: 'admin'` fixo; um único `ADMIN_SECRET` | `productionGovernance.ts:207-234` |
| 14 | Bugs de 1 linha: slug `analytics` vs `analytics-product`; count global `agentSlug: 'waiter'` sem tenant | `AIEngineRouter.ts:41`; `RestaurantKnowledgeAdapter.ts:37` |

**Síntese:** o esqueleto é excelente; a musculatura está desligada. A rota para
10/10 não é reescrever — é **tornar verdadeiro o que a arquitetura já promete**.

---

## 2. Princípios do roadmap (as leis de execução)

1. **Ordem causal estrita.** Primeiro o Brain SABE (verdade profunda), depois
   LEMBRA (memória), depois FALA ao vivo (free-form governado), depois APRENDE
   (loop fechado), e só então o corpo TROCA (universalização). Religar o
   free-form antes da verdade profunda repete o incidente rodízio.
2. **Extração por último, não primeiro.** A fronteira do kit é *descoberta*
   fazendo o restaurante deixar de ser especial dentro do repo atual, *provada*
   pela segunda vertical, e só então *movida* para pacotes. Nunca big-bang.
3. **Sem rename de tenancy.** `restaurantId` sustenta 40+ relações. A entidade
   `Business` entra como **shim** (businessId → businessType + settings) por
   cima, sem tocar nas tabelas de restaurante.
4. **Consolidar antes de replicar.** As 6 filas e 4 miners viram 1 inbox e 1
   intake ANTES da clínica existir — senão replicamos a fragmentação.
5. **Toda reativação sobe a escada existente:** shadow → allowlist → wide, com
   gates P0=0, golden set e rollback de 30s (o padrão do Text Ordering).

---

## 3. Fase 0 — Vitórias rápidas (dias, começa já)

Cada item é pequeno, verificado e de alto impacto:

- [ ] **CI real:** `.github/workflows/ci.yml` rodando `type-check` + `vitest`
      em todo push/PR (as suítes já existem e passam; hoje não gateiam nada).
- [ ] **KnowledgeAdapterRegistry:** trocar o `if-RESTAURANT` de
      `BrainReasoner.loadKnowledge` (linhas 77-82) por lookup em registry —
      torna a promessa "o Brain não muda" verdadeira na linha exata onde é falsa.
- [ ] **Serializar as 10 chaves** de `truthSources` em `knowledgeBlock()`.
- [ ] **Snapshot com fatos v1:** nomes + preços reais de itens
      (incl. `priceDelivery`/`priceDineIn`), `BusinessHours`, promoções e
      Q&A curado ACTIVE (`RestaurantKnowledgeItem`) no snapshot.
- [ ] **Janela de conversa:** `sanitizedHistory` no `BrainReasoningRequest` +
      últimos 6-8 turnos sanitizados no lugar do `findFirst`.
- [ ] **Caso rodízio no golden set** de `WhatsAppBrainDiagnostic` — o incidente
      que desligou o free-form vira teste de regressão permanente.
- [ ] **Ligar o shadow mode existente** (`WhatsAppBrainReasoningAdapter.ts:254-262`):
      logar resposta-LLM vs resposta-determinística em tráfego real, sem
      impacto no cliente — acúmulo de evidência de graça.
- [ ] **Consertar os bugs de 1 linha:** slug analytics; count `agentSlug:'waiter'`.
- [ ] **ESLint `no-restricted-imports`:** proibir `openai`/`@/lib/openai` fora
      de `src/services/brain/engines/` (lista de exceções congelada que só
      diminui) — metade mecânica do dente #2 da Regra de Ouro.
- [ ] **Primeiro caller do pool morto:** injetar `listApprovedLearningsForBrain`
      no prompt do `reasonAsAgent` — as aprovações humanas passam a valer.

---

## 4. As 6 fases

### Fase 1 — Alicerce: descolar o cérebro do restaurante `[M · risco LOW]`

**Meta:** eliminar o acoplamento hardcoded RESTAURANT/waiter do núcleo e
instalar a fiscalização arquitetural — antes de qualquer expansão.

- `KnowledgeAdapterRegistry.ts` (se não veio da Fase 0) + `BusinessType` aberto
  (branded string derivada do registry); remover a union duplicada e os
  defaults `'RESTAURant'` em `PersistentBrainDirectorService.ts:44,76`.
- Contratos próprios do Brain: `AgentReasoningContract`, `IntentGuardrails` e
  `CoherenceValidator` deixam de re-exportar arquivos do Waiter; intent vira
  string opaca validada contra taxonomia declarada pela vertical.
- Escopo por dados: `reasonAsAgent` resolve perfil via `AgentProfileService`
  (DB-first, registry de código como piso que nunca lança) em vez de
  `getDefaultAgentProfileBySlug` direto.
- Teste arquitetural `architecture.test.ts`: quebra o build se um agente
  produzir resposta ao cliente sem passar pelo portão (dente #2 completo).

### Fase 2 — Verdade profunda, memória e sombra `[L · risco LOW-MED]`

**Meta:** curar a causa-raiz do rodízio. O Brain passa a SABER e LEMBRAR.

- `RestaurantKnowledgeAdapter` v2: snapshot fact-level com orçamento de tokens
  + metadata `snapshotAsOf`/`completenessScore` (auditável: "o que o Brain
  sabia quando respondeu").
- `KnowledgeRetrievalService`: retrieval sob demanda sobre
  `RestaurantKnowledgeItem` + `AgentLibrarySourceChunk` (keyword primeiro,
  embeddings atrás da mesma interface depois).
- Generalizar `RestaurantKnowledgeItem` → `KnowledgeItem` por `businessId`
  (mantendo o ciclo SUGGESTED→APPROVED→ACTIVE) como entrada obrigatória de
  todo snapshot.
- Memória: `ConversationWindowService` (janela sanitizada com orçamento) +
  `CustomerMemoryService` + modelo `BrainCustomerMemory` (resumo durável por
  cliente, atualizado async, sem PII crua — `BRAIN_SAFETY` intacto).
- `SnapshotCoherenceVerifier` / `BrainCoherenceCritic`: verificação
  claim-vs-snapshot (preço/item/horário citado na resposta TEM que existir na
  verdade) via LLM-judge barato roteado — substitui o stub que hardcoda
  `doesNotInventFacts: true`.
- Shadow rodando em produção acumulando diffs em `BrainShadowLog`.

**→ Nota "é uma IA?": 7/10.** O Brain vê fatos, tem memória e um crítico real —
ainda mudo em produção, mas com evidência de sombra provando qualidade.

### Fase 3 — Religar o raciocínio vivo sob governança `[M-L · risco HIGH]`

**Meta:** o caminho `reasonAsAgent` volta a executar para clientes reais, pela
mesma escada que protege o Text Ordering.

- `BrainRuntimeConfig` (modelo Prisma + service espelhando
  `WhatsAppTextOrderingConfigService`): escopo por business, modos
  SHADOW_ONLY → ALLOWLIST → WIDE, allowlist de telefones. **Deletar** as duas
  consts hardcoded (`ALLOW_BRAIN_FREE_FORM`, `ALLOW_FREE_FORM_REPLIES`).
- **`ChangeRequestApplier`** (`src/services/brain/director/`): lê CR APPROVED,
  executa o quality gate exigido no apply (deixa de ser advisory), escreve a
  config alvo, chama `markApplied`/`markRolledBack`. Aprovação passa a ter um
  braço executor governado — fecha o buraco do "aprovar não aplica nada".
- `freeFormGovernance.ts` nos moldes de `productionGovernance.ts`: promoção
  exige golden set PASS p0=0 (incl. rodízio), taxa de divergência do shadow
  abaixo do teto por N dias, `completenessScore` acima do piso, allowlist
  não-vazia; `rollbackFreeForm` de 30s.
- Confidence real: abaixo do threshold por business → recepcionista
  determinístico + escalação, em vez de responder.
- Piso de segurança intocado: âncora de menu, idempotência,
  escalate-after-send, `BACK_TO_MENU_FOOTER`.
- Generalizar `productionGovernance.ts` (remover "Sushi Cazza" hardcoded).

**→ Nota: 8/10.** O Brain pensa em produção pela primeira vez desde o
incidente — com crítico anti-alucinação, gates e rollback comprováveis.

### Fase 4 — Um só portão, multi-piloto, perfis no banco `[L · risco MED]`

**Meta:** colapsar os pipelines paralelos no portão único e tornar o
"troca-troca de piloto" real.

- Contrato `EngineAdapter` + `AnthropicEngineAdapter` (`@anthropic-ai/sdk`) e
  `GeminiEngineAdapter` — `OpenAIEngineAdapter.ts:27-29` para de lançar erro.
- `BrainEngineRouting` persistido (businessId?, agentId, taskProfile
  CLASSIFY|REASON|JUDGE|GENERATE → provider+model), escrito **somente** pelo
  `ChangeRequestApplier` em CR `AI_ENGINE_ROUTING` aprovado — governança
  finalmente controla o roteamento de verdade.
- Migrar os 4 bypasses pelo router; lista de exceções do ESLint chega a zero.
- `taskType` no `BrainReasoningRequest` (`REPLY | CAMPAIGN_COPY | INSIGHT`) com
  schemas de saída por tarefa; **CRM vira o segundo consumidor real**
  (`MessageVariationService.generatePreview` → `reasonAsAgent({agentId:'crm',
  taskType:'CAMPAIGN_COPY'})` com contexto de inteligência de cliente).
- Failover entre providers reais em `EngineFallbackPolicy` com health/latência.

### Fase 5 — Fechar o ciclo de aprendizado `[L · risco MED]`

**Meta:** de "sistema que aprende no papel" a organismo que melhora sozinho sob
supervisão.

- Store canônico `BrainLearning` (promover `WaiterTrainingSuggestion`, que já é
  multi-agente via `agentSlug`) lido direto pelo `BrainTrainingContract`;
  aprendizados aprovados entram no prompt automaticamente, com cap e ranking.
- Registry de quality gates por `agentSlug` (espelhando o registry de auditores
  em `QualityControlService.ts:35-40`) — mata o "v1: apenas waiter".
- **Avaliar o candidato, não o incumbente:** `activateVersion` roda simulador +
  auditor contra a versão TESTING antes de ativar; canary por coorte.
- Auto-file de governança: novo P0 / FAIL de simulador cria
  `BrainChangeRequest` MEDIUM (`requestedByType: TRAINING_CENTER`) + alerta
  ativo ao dono (hoje regressão espera alguém abrir /admin/quality).
- Consolidação: 1 inbox de aprovação (estender `approvalInbox.ts` às 6 filas,
  com dedupe/clustering por conversa), 1 intake de mineração.
- Autonomia por risco: LOW auto-aprova se gate passa (com trilha), MEDIUM em
  lote, HIGH/CRITICAL sempre humano — `requiresHumanApproval` deixa de ser
  always-true por política explícita.
- LLM-judge online: amostragem de respostas enviadas julgada contra
  `evaluationCriteria` do perfil (multi-provider via router), alimentando a
  fila de treino.

**→ Nota: 9/10.** Um portão serve treino, WhatsApp, pedidos, CRM e analytics;
Claude é segundo piloto real roteado por config governada; o loop está fechado.

### Fase 6 — Clínica de estética: a prova de universalidade `[XL · risco MED]`

**Meta:** o teste de aceitação do "corpo muda, cérebro fica" — uma clínica
atende pelo MESMO `reasonAsAgent` entregando **apenas adapters e dados**, com
CI provando zero commits no núcleo.

- **Business shim:** tabela `Business` (businessId → businessType, locale,
  settings) por cima do schema atual; businessType resolvido uma vez na borda
  do canal; `restaurantId` intocado.
- **`ChannelAdapter`** (contrato): `normalizeInbound → {businessId,
  participant, text, history}`, `deliver(reply)`, `escalate(reason)` +
  idempotência — `WhatsAppBrainRuntimeService` refatorado como primeira
  implementação, separando plumbing Evolution/Meta da política de negócio.
- **`VerticalPack`** (dados, não código): taxonomia de intents, guardrails
  ("alergia a lidocaína" → SAFETY; proibição de claims médicos), vocabulário de
  coerência, scripts de fallback, labels e locale — o pack do restaurante é
  extraído dos arquivos do waiter como primeiro exemplo.
- **`BeautyClinicKnowledgeAdapter`** (procedimentos + preços, profissionais,
  agenda, políticas) registrado no registry **sem tocar no núcleo**; perfis
  ("recepcionista", "agendamento", "pós-procedimento") criados via API no DB,
  sem deploy.
- **`FlowDefinition`** genérica no motor de state machine: "comanda" vira
  "agenda" trocando a definição, não o motor.
- Gate + simulador da clínica registrados (segunda implementação do
  `AgentSimulationAdapter` — prova a abstração além do waiter).
- **Extração final dos pacotes:** `packages/brain-core`, `brain-engines`,
  `brain-governance`, `brain-contracts` — zero import de Prisma vertical,
  persistência atrás de interfaces de repositório, teste de dependência no CI
  que quebra o build em violação de fronteira.
- `docs/vertical-onboarding-playbook.md`: checklist "nova vertical em < 5 dias"
  com critério de aceite **zero commits em brain-core**.

**→ Nota: 10/10.** Universalidade provada, não declarada: o mesmo kit que opera
o restaurante responde uma pergunta de agendamento de clínica ponta a ponta.

---

## 5. Escada de nota (resumo)

| Nota | Marco | Prova |
|---|---|---|
| **7/10** | Fim da Fase 2 | Snapshot fact-level + memória + crítico real + evidência de shadow em tráfego real |
| **8/10** | Fim da Fase 3 | LLM vivo em produção sob escada governada; approve→apply funcionando; rollback 30s |
| **9/10** | Fim da Fase 5 | Multi-piloto real; todos os caminhos LLM no portão; loop de aprendizado fechado |
| **10/10** | Fim da Fase 6 | Clínica operando com zero mudanças no núcleo; CI fiscalizando a fronteira |

---

## 6. Riscos principais e mitigações

1. **Religar o free-form repete o rodízio.** Mitigação: ordem causal estrita
   (verdade + crítico + shadow-diff ANTES de qualquer resposta viva), caso
   rodízio como P0 permanente, allowlist primeiro, rollback 30s.
2. **Big-bang de tenancy trava tudo.** Mitigação: `Business` como shim; nenhum
   rename de `restaurantId`; resolução de businessType só na borda do canal.
3. **Replicar a fragmentação para a clínica.** Mitigação: consolidação
   (Fase 5) é pré-requisito da replicação (Fase 6), na ordem do roadmap.
4. **Extração prematura calcifica fronteiras erradas.** Mitigação: extração é
   a ÚLTIMA entrega, depois que CRM e clínica exercitaram as costuras.
5. **Teatro de governança.** `openRestaurantWide` executa antes de registrar;
   `reviewedBy` fixo; um `ADMIN_SECRET` só. Mitigação: `ChangeRequestApplier`
   como único caminho de escrita de config governada + identidade de revisor
   real no fluxo de aprovação.

---

## 7. O ativo "patenteável" (o que o kit final contém)

Ao fim da Fase 6, o produto replicável é composto de:

- **brain-core** — o fluxo cognitivo ESCOPO→VERDADE→PILOTO→COERÊNCIA, a
  disciplina de fallback/escalação, o contrato de segurança congelado;
- **brain-engines** — pilotos plugáveis (OpenAI/Claude/Gemini) com roteamento
  por tarefa persistido e governado, failover e fallback determinístico;
- **brain-governance** — change requests, política de risco, aprovação humana,
  applier com gate obrigatório, rollback e trilha de auditoria imutável;
- **brain-contracts (SDK)** — o que uma nova vertical entrega:
  `BusinessKnowledgeAdapter` + `VerticalPack` + `ChannelAdapter` +
  perfis de agente + gate/simulador registrados;
- **O loop** — treino, qualidade, evidência e auto-avaliação fechando o ciclo
  em qualquer vertical.

**Abrir uma empresa nova = 1 knowledge adapter + 1 vertical pack + perfis no
banco + 1 flow definition. O cérebro não muda.**
