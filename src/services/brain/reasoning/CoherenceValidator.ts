/**
 * CoherenceValidator — Brain re-export of the generic coherence validation.
 * Before ANY reasoning output becomes a proposal, the Brain verifies it actually
 * answers the user's question, matches the intent, invents nothing and keeps the
 * business objective.
 */

export {
  validateCoherence,
  type CoherenceInput,
} from "@/services/agents/reasoning/AgentReasoningCoherenceValidator";
