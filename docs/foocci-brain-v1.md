# Foocci Brain v1

> A aplicação do Business Brain (`docs/business-brain-architecture.md`) no Foocci.
> Criado em 2026-06-10. **Nada nesta camada toca o atendimento real** — o Brain
> raciocina, propõe e valida; ativação real continua exigindo versão de teste +
> Quality Gate + humano.

## O que existe no código (src/services/brain/)

| Módulo | Arquivos | Estado |
|---|---|---|
| **Core** | `core/BrainTypes.ts` (BrainReasoningRequest/Result, fluxo obrigatório), `core/BrainSafety.ts` (invariantes congeladas + assert) | ✅ |
| **Director** | `director/BrainDirectorService.ts` (in-memory v1), `BrainChangeRequest.ts`, `BrainGovernancePolicy.ts` | ✅ |
| **Engines** | `engines/AIEngineRouter.ts` (default OpenAI gpt-4o-mini preservado), `AIEngineTypes.ts`, `OpenAIEngineAdapter.ts` (re-export do singleton existente), `EngineFallbackPolicy.ts` | ✅ |
| **Knowledge** | `knowledge/BusinessKnowledgeContract.ts`, `RestaurantKnowledgeAdapter.ts` (read-only, sem PII) | ✅ |
| **Reasoning** | `reasoning/AgentReasoningContract.ts` + `IntentGuardrails.ts` + `CoherenceValidator.ts` (re-exports canônicos do que nasceu no Waiter) + `WaiterBrainReasoningAdapter.ts` | ✅ |
| **Training** | `training/BrainTrainingContract.ts` (ApprovedLearning ← WaiterTrainingSuggestionStore) | ✅ |
| **Quality** | `quality/BrainQualityGate.ts` (gate do Waiter no contrato do Brain) | ✅ |
| **Evidence** | `evidence/BrainEvidenceContract.ts` (`canUseCommercially` = APPROVED + flag) | ✅ |
| **Painel** | `/admin/brain` (read-only, status v1) | ✅ |

## Decisões de extração (o que é genérico vs. específico)

**Subiu para o Brain (genérico):** contrato de intenção/raciocínio, coherence
validator, guardrails de intenção, engine router + fallback policy, knowledge
contract, contrato de treinamento/aprendizado aprovado, contrato de quality gate,
contrato de evidência, padrão de governança (change request).

**Ficou no Waiter (específico):** WaiterBrainV2/PromptBuilder (runtime real,
INTOCADOS), templates de resposta de garçom, upsell de bebida/sobremesa,
restrições alimentares, checkout guidance, cardápio/pagamento de restaurante
(acessados via adapter), simulação/cenários do Waiter.

**Estratégia adotada (Opção B, menor risco):** os arquivos originais em
`src/services/agents/reasoning` NÃO foram movidos — o Brain os re-exporta como
superfície canônica. Zero import quebrado; todos os testes existentes passam.
O Waiter vira consumidor via `WaiterBrainReasoningAdapter`
(BrainReasoningRequest → WaiterReasoningService → BrainReasoningResult).

## Estado do roteamento de motores (v1)

`AGENT_ENGINE_PREFERENCES` mantém **todos os agentes em OPENAI/gpt-4o-mini** — o
que já roda hoje. Trocar um agente de motor exige `BrainChangeRequest` com target
`AI_ENGINE_ROUTING` (risco HIGH ⇒ aprovação humana + gate). Sem provider
configurado, o router cai com segurança: default → MOCK/fallback determinístico.

## O que o Waiter já entrega ao Brain

- Reasoning Layer completa (guardrails + contexto + LLM/fallback + coerência);
- Training Center (casos reais → propostas → aprovação humana → pool);
- Simulation Lab diário + Quality (4 auditores, P0=0);
- Runtime Merge com Quality Gate e rollback;
- Evidence (provas de resultado sanitizadas).

## O que CRM/WhatsApp/Analytics vão reaproveitar

O contrato cognitivo, os guardrails, o coherence validator, o engine router, o
padrão de proposta+aprovação, o gate e o contrato de evidência. Cada um precisará
apenas de: (1) seu adapter de raciocínio; (2) sua extensão de Knowledge; (3) seus
guardrails específicos.

## Brain Director Governance (persistente)

O Director agora é um sistema governado de verdade:

- **Modelo:** `BrainChangeRequest` (tabela `brain_change_requests`, migration
  aditiva) — businessId/Type, requestedByType (CEO/AGENT/SYSTEM/TRAINING_CENTER/
  BRAIN_DIRECTOR), target (9 alvos: reasoning/knowledge/policy/gate/training/
  engine-routing/knowledge-base/simulation/evidence), summary/rationale/
  proposedChange, riskLevel, status (DRAFT→PENDING_APPROVAL→APPROVED/REJECTED/
  BACKLOG→APPLIED/ROLLED_BACK), requiresQualityGate, runtimeImpact,
  reviewedBy/At/decisionReason, metadata. Histórico nunca é apagado.
- **Quem cria:** qualquer camada (CEO, Training Center, agente, sistema) — mas
  **tudo entra PENDING_APPROVAL**; AGENT/SYSTEM jamais criam algo aprovado e
  jamais geram risco LOW estrutural.
- **Quem aprova:** só humano identificado (revisores "agent"/"system"/"bot"/"ai"
  são recusados com erro). Toda decisão grava reviewedBy/reviewedAt/decisionReason.
- **O que a aprovação FAZ:** muda status para APPROVED. Ponto.
- **O que a aprovação NÃO faz:** não aplica a mudança, não toca prompt/runtime,
  não ativa nada. Aplicar é um fluxo separado (versão de teste + Quality Gate +
  ativação manual), registrado depois via `markApplied`/`markRolledBack`.
- **Quando exige Quality Gate:** risco HIGH/CRITICAL e qualquer
  `runtimeImpact ≠ NONE`. `PRODUCTION` força risco CRITICAL.
- **Por que agentes não alteram o Brain:** o Brain é a arquitetura — se o
  executor pudesse reescrever a própria governança, não haveria governança.
- **APIs (admin):** `GET/POST /api/admin/brain/change-requests`,
  `PATCH /api/admin/brain/change-requests/[id]` (approve/reject/backlog).
- **Fila operacional:** seção "Brain Director — Solicitações de mudança" em
  `/admin/brain` (pendentes, alto risco, impacto produção, últimas decisões).

## Ainda futuro (não nesta rodada)

- CRM como segundo consumidor; WhatsApp; Analytics;
- Engines CLAUDE/GEMINI reais no adapter (hoje só contrato + fallback);
- Knowledge snapshot com horários detalhados/promoções;
- Fluxo de aplicação governada (APPROVED → versão de teste → APPLIED).

## Garantias verificadas por teste

BrainSafety congelado (nunca toca runtime/envia/aceita PII); Director nunca
auto-aprova e recusa decisão de AGENT/SYSTEM; PRODUCTION ⇒ CRITICAL + gate;
router preserva default e faz fallback seguro; snapshot sem PII; caso Alelo
preservado via adapter (PAYMENT_BENEFIT_QUESTION, coerência PASS,
`runtimeTouched:false`); evidência só comercial com aprovação + flag.
