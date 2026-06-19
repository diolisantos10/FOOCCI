/**
 * Selector for the human-attention (atendimento) alarm.
 *
 * A conversation needs the alarm while a customer is waiting for a human and NO
 * operator has taken over yet — that is exactly status === "HUMAN".
 *
 *   • HUMAN          → customer requested a human, not yet assumed → ALARM
 *   • HUMANO_ASSUMIU → an operator took over (takeover) → acknowledged → silent
 *   • RESOLVED       → closed → silent
 *   • OPEN/BOT/...    → not a human request → silent
 *   • aiLocked (Staff/equipe / Fornecedor) → never a customer waiting → silent
 *
 * Driving the alarm off status (not off messages or selection) means:
 *   - operator messages never start the alarm (status stays HUMAN until assumed);
 *   - merely opening/viewing the conversation never stops it;
 *   - another operator assuming it flips the status away from HUMAN → it stops;
 *   - a Staff/equipe conversation (permanent AI lock) never rings the alarm.
 */

export interface HandoffConversationLike {
  id: string;
  status: string;
  /** Permanent Staff/Supplier AI lock — such conversations never drive the alarm. */
  aiLocked?: boolean | null;
}

export const HANDOFF_REQUEST_STATUS = "HUMAN";

/** IDs of conversations with a pending (unassumed) human-attention request.
 *  Excludes already-assumed (HUMANO_ASSUMIU) and Staff/equipe (aiLocked). */
export function pendingHumanRequestIds(conversations: HandoffConversationLike[]): string[] {
  return conversations
    .filter((c) => c.status === HANDOFF_REQUEST_STATUS && !c.aiLocked)
    .map((c) => c.id);
}
