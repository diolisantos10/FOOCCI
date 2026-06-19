/**
 * Shared constants for the WhatsApp live-learning layer. The learning queue is
 * persisted in the existing `WaiterTrainingSuggestion` table, isolated from the
 * waiter suggestions by a dedicated agentSlug — so no schema migration is needed
 * and the two queues never mix.
 */

/** agentSlug used to isolate WhatsApp receptionist learnings in the suggestions table. */
export const WHATSAPP_LEARNING_AGENT_SLUG = "whatsapp-receptionist";

/** sourceType for learnings mined from real conversations. */
export const WHATSAPP_LEARNING_SOURCE_TYPE = "REAL_CONVERSATION";

/** Queue statuses (a subset of WaiterTrainingSuggestion.status). */
export const LEARNING_STATUS = {
  PENDING: "PENDING_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  BACKLOG: "BACKLOG", // "Guardar para depois"
} as const;

export type LearningStatus = (typeof LEARNING_STATUS)[keyof typeof LEARNING_STATUS];
