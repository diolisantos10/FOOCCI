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
 *   • handoffAlarmAckAt set → operator hit "Estou ciente" → silent (see below)
 *
 * Driving the alarm off status (not off messages or selection) means:
 *   - operator messages never start the alarm (status stays HUMAN until assumed);
 *   - merely opening/viewing the conversation never stops it;
 *   - another operator assuming it flips the status away from HUMAN → it stops;
 *   - a Staff/equipe conversation (permanent AI lock) never rings the alarm.
 *
 * PERSISTENT ACKNOWLEDGEMENT (handoffAlarmAckAt): "Estou ciente" used to silence
 * the alarm only in the tab that had Atendimento open (ephemeral React state) —
 * so the app-wide GlobalAlertEngine, running on Início / CRM / Pedidos / another
 * device, kept ringing for the very same conversation with no way to stop it.
 * The acknowledgement is now written to the DB (Conversation.handoffAlarmAckAt)
 * and this selector honours it, so a "ciente" conversation is silent EVERYWHERE.
 * A fresh escalation clears the timestamp (see markConversationNeedsHuman), so a
 * genuinely new human request on a previously-acknowledged conversation rings
 * again.
 */

export interface HandoffConversationLike {
  id: string;
  status: string;
  /** Permanent Staff/Supplier AI lock — such conversations never drive the alarm. */
  aiLocked?: boolean | null;
  /** Set when an operator acknowledged the alarm ("Estou ciente"); silences it
   *  app-wide until a fresh escalation clears it. */
  handoffAlarmAckAt?: string | Date | null;
}

export const HANDOFF_REQUEST_STATUS = "HUMAN";

/** IDs of conversations with a pending (unassumed) human-attention request.
 *  Excludes already-assumed (HUMANO_ASSUMIU), Staff/equipe (aiLocked), and any
 *  conversation an operator has acknowledged (handoffAlarmAckAt set). */
export function pendingHumanRequestIds(conversations: HandoffConversationLike[]): string[] {
  return conversations
    .filter((c) => c.status === HANDOFF_REQUEST_STATUS && !c.aiLocked && !c.handoffAlarmAckAt)
    .map((c) => c.id);
}
