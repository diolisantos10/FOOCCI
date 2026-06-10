/**
 * AgentReasoningContract — the Brain's reasoning contract.
 *
 * The generic reasoning machinery was BORN inside the Waiter
 * (src/services/agents/reasoning) and is re-exported here as the canonical Brain
 * surface — no file moves, no broken imports, all existing tests keep passing.
 * New agents should import from `@/services/brain` going forward.
 */

export type {
  AgentReasoningIntent,
  AgentReasoningResult,
  AgentReasoningInput,
  AgentReasoningContext,
  AgentReasoningCoherenceCheck,
  ReasoningVerdict,
  ReasoningMode,
  ReasoningSourceType,
} from "@/services/agents/reasoning/AgentReasoningTypes";
