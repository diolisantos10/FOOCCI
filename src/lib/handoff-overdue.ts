/**
 * handoff-overdue — pure detection for the "handoff went unanswered" ALERT.
 *
 * The PRODUCT DECISION (2026-05-28) stands: a human handoff is persistent and the
 * AI never auto-returns. This module does NOT change that — it only flags, for the
 * Atendimento alarm, conversations where the customer's last message has gone
 * unanswered by a human for too long.
 *
 * Why it's needed: the standard handoff alarm (see handoff-alert.ts) rings only
 * while status === "HUMAN" (pending, not yet assumed). The moment an operator hits
 * "Assumir" (→ HUMANO_ASSUMIU) or "Estou ciente", that alarm goes silent — so a
 * conversation that is assumed/acknowledged but then never actually answered falls
 * off the radar with no AI and no alarm. This re-raises an alert for exactly that
 * dropped-ball case, without touching the conversation (no auto-return).
 *
 * Pure (no I/O) so it is trivially unit-testable.
 */

export interface OverdueCandidate {
  id: string;
  customerName: string | null;
  /** Most recent message timestamp (Conversation.lastMessageAt). */
  lastMessageAt: Date | null;
  /** Direction of the most recent message: "INBOUND" | "OUTBOUND". */
  lastDirection: string | null;
  /** senderType of the most recent message: CUSTOMER | AI | HUMAN | SYSTEM. */
  lastSenderType: string | null;
  /** When the operator acknowledged this alarm ("Estou ciente"/"Silenciar").
   *  An ack at or after the customer's last message silences the overdue alert;
   *  a NEWER customer message (lastMessageAt > ack) re-arms it. */
  handoffAlarmAckAt?: Date | null;
}

export interface OverdueHandoff {
  id: string;
  customer: string;
  waitingMinutes: number;
}

/**
 * Is the customer still waiting for a human reply?
 *
 * A genuine reply is an OUTBOUND message from a human operator or the AI. An
 * OUTBOUND SYSTEM message (e.g. the `[handoff:REASON]` marker written when the
 * conversation is handed off) does NOT count — the customer is still waiting
 * after it. Anything else (last message INBOUND from the customer, or only the
 * SYSTEM handoff marker) means nobody has answered yet.
 */
export function isAwaitingHumanReply(
  c: Pick<OverdueCandidate, "lastDirection" | "lastSenderType">,
): boolean {
  const repliedByHumanOrAi =
    c.lastDirection === "OUTBOUND" &&
    (c.lastSenderType === "HUMAN" || c.lastSenderType === "AI");
  return !repliedByHumanOrAi;
}

/**
 * Conversations whose customer has waited >= thresholdMs without a human/AI reply,
 * most overdue first. The caller is responsible for tenant scoping and for
 * pre-filtering to human-mode, non-locked, customer conversations.
 */
export function selectOverdueHandoffs(
  candidates: OverdueCandidate[],
  now: Date,
  thresholdMs: number,
): OverdueHandoff[] {
  const out: OverdueHandoff[] = [];
  for (const c of candidates) {
    if (!c.lastMessageAt) continue;
    if (!isAwaitingHumanReply(c)) continue;
    // Operator acknowledged this alarm and no newer customer message has arrived
    // since → stay silent. A later customer message (lastMessageAt > ack) re-arms.
    if (c.handoffAlarmAckAt && c.handoffAlarmAckAt.getTime() >= c.lastMessageAt.getTime()) continue;
    const elapsed = now.getTime() - c.lastMessageAt.getTime();
    if (elapsed < thresholdMs) continue;
    out.push({
      id: c.id,
      customer: c.customerName?.trim() || "Cliente",
      waitingMinutes: Math.floor(elapsed / 60_000),
    });
  }
  return out.sort((a, b) => b.waitingMinutes - a.waitingMinutes);
}
