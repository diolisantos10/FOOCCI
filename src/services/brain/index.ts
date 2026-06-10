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
export { selectEngine, configuredProviders, AGENT_ENGINE_PREFERENCES } from "./engines/AIEngineRouter";
export { onEngineFailure } from "./engines/EngineFallbackPolicy";

// knowledge
export * from "./knowledge/BusinessKnowledgeContract";
export { restaurantKnowledgeAdapter } from "./knowledge/RestaurantKnowledgeAdapter";

// reasoning (generic contract born in the Waiter, canonical here)
export * from "./reasoning/AgentReasoningContract";
export { detectGuardrailIntent, isPaymentIntent } from "./reasoning/IntentGuardrails";
export { validateCoherence } from "./reasoning/CoherenceValidator";
export { reasonViaBrain } from "./reasoning/WaiterBrainReasoningAdapter";

// training / quality / evidence
export * from "./training/BrainTrainingContract";
export * from "./quality/BrainQualityGate";
export * from "./evidence/BrainEvidenceContract";
