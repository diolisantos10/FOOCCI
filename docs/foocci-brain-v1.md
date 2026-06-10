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

## Ainda futuro (não nesta rodada)

- Persistência dos change requests do Director (v1 in-memory por design);
- CRM como segundo consumidor; WhatsApp; Analytics;
- Engines CLAUDE/GEMINI reais no adapter (hoje só contrato + fallback);
- Knowledge snapshot com horários detalhados/promoções;
- UI de governança do Director (fila de change requests).

## Garantias verificadas por teste

BrainSafety congelado (nunca toca runtime/envia/aceita PII); Director nunca
auto-aprova e recusa decisão de AGENT/SYSTEM; PRODUCTION ⇒ CRITICAL + gate;
router preserva default e faz fallback seguro; snapshot sem PII; caso Alelo
preservado via adapter (PAYMENT_BENEFIT_QUESTION, coerência PASS,
`runtimeTouched:false`); evidência só comercial com aprovação + flag.
