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
 *
 * Driving the alarm off status (not off messages or selection) means:
 *   - operator messages never start the alarm (status stays HUMAN until assumed);
 *   - merely opening/viewing the conversation never stops it;
 *   - another operator assuming it flips the status away from HUMAN → it stops.
 */

export interface HandoffConversationLike {
  id: string;
  status: string;
}

export const HANDOFF_REQUEST_STATUS = "HUMAN";

/** IDs of conversations with a pending (unassumed) human-attention request. */
export function pendingHumanRequestIds(conversations: HandoffConversationLike[]): string[] {
  return conversations
    .filter((c) => c.status === HANDOFF_REQUEST_STATUS)
    .map((c) => c.id);
}
