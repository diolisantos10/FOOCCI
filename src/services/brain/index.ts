/**
 * Foocci Brain v1 — public surface.
 *
 * "A IA não é o produto. O Brain é o produto."
 *
 * Layers: CEO → Brain Director → Foocci Brain → AI Engine Router → Knowledge
 * Base → Agent Departments → Training Center → Quality & Simulation → Evidence.
 * New agents import from here; the Waiter is the v1 reference consumer.
 */

// core
export * from "./core/BrainTypes";
export * from "./core/BrainSafety";

// director (governance) — persistent service is the canonical one
export * from "./director/BrainChangeRequest";
export {
  createChangeRequest,
  reviewChangeRequest,
  approve as approveChangeRequest,
  reject as rejectChangeRequest,
  backlog as backlogChangeRequest,
  markApplied,
  markRolledBack,
  listChangeRequests as listPersistedChangeRequests,
  getRiskSummary,
} from "./director/PersistentBrainDirectorService";
export {
  submitChangeRequest,
  decideChangeRequest,
  getChangeRequest,
  listChangeRequests,
} from "./director/BrainDirectorService";
export { classifyChangeRisk, requiresQualityGate, requiresHumanApproval } from "./director/BrainGovernancePolicy";

// engines
export * from "./engines/AIEngineTypes";
export {
  selectEngine,
  selectEngineRouted,
  configuredProviders,
  AGENT_ENGINE_PREFERENCES,
  type EngineTaskProfile,
} from "./engines/AIEngineRouter";
export type { StructuredCallInput } from "./engines/EngineAdapter";
export { callStructuredJson } from "./engines/OpenAIEngineAdapter";
export { onEngineFailure } from "./engines/EngineFallbackPolicy";

// runtime governance (Fase 3 — escada do raciocínio livre + evidência de sombra)
export * from "./runtime/BrainFreeFormConfigService";
export * from "./runtime/freeFormGovernance";
export * from "./runtime/BrainShadowEvidenceService";
export { replayShadowFromHistory } from "./runtime/ShadowReplayService";

// director — approve→apply bridge (Fase 3)
export { applyChangeRequest } from "./director/ChangeRequestApplier";

// training — produtor automático de governança (Fase 5)
export { autoFileGovernanceForLatestRun } from "./training/QualityGovernanceBridge";

// knowledge
export * from "./knowledge/BusinessKnowledgeContract";
export { restaurantKnowledgeAdapter } from "./knowledge/RestaurantKnowledgeAdapter";

// memory (Cognição 8→9 — memória durável de cliente, sem PII)
export * from "./memory/CustomerMemoryService";

// reasoning (generic contract born in the Waiter, canonical here)
export { judgeReply, type CriticVerdict } from "./reasoning/BrainCoherenceCritic";
export * from "./reasoning/AgentReasoningContract";
export { detectGuardrailIntent, isPaymentIntent } from "./reasoning/IntentGuardrails";
export { validateCoherence } from "./reasoning/CoherenceValidator";
export { reasonViaBrain } from "./reasoning/WaiterBrainReasoningAdapter";

// training / quality / evidence
export * from "./training/BrainTrainingContract";
export * from "./quality/BrainQualityGate";
export * from "./evidence/BrainEvidenceContract";

// oficina (Fatia 1 — a fábrica de perguntas: pedido cru → ficha → juiz → comando)
export * from "./oficina/OficinaTypes";
export { forjar, montarFicha, renderizar, type ForjarInput, type ForjaResult } from "./oficina/OficinaService";
export { criticar, CORTE_PADRAO } from "./oficina/PromptCritic";
export {
  registerManual,
  resolveManual,
  registeredDominios,
  violacoes,
  manualRestaurante,
  type Manual,
} from "./oficina/HouseManual";
export { variar, assinar, semear, totalDeCombinacoes, type Eixo, type Variacao } from "./oficina/Variator";
export { criticarResultado, type CriticaResultadoOpts } from "./oficina/OutputCritic";
export { buscarVerdade, snapshotParaVerdade, type VerdadeBuscada } from "./oficina/TruthSource";
export { criarReescritor } from "./oficina/Reescritor";
export {
  chaveDeMemoria,
  getAssinaturaMemory,
  setAssinaturaMemory,
  resetAssinaturaMemory,
  JANELA_PADRAO,
  type AssinaturaMemory,
} from "./oficina/AssinaturaMemory";
export {
  rodarEsteira,
  forjarComando,
  type EsteiraInput,
  type EsteiraResult,
  type ModoDaEsteira,
} from "./oficina/OficinaPipeline";
export { runOficinaDiagnostic, type OficinaDiagnosticResult } from "./oficina/OficinaDiagnostic";
