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
 *
 * STALE AUTO-SILENCE (maxAgeMs): a handoff whose customer has been silent for
 * hours is not "someone waiting right now" — yet the alarm used to ring it
 * forever on every page, which is exactly the "apita e não para" the restaurant
 * hit when old (often false) escalations piled up. When maxAgeMs is passed, a
 * conversation whose last message is older than that window stops making SOUND
 * on its own — no click, no navigation. It is sound-only: the conversation stays
 * visible (red) in the inbox, so nothing is hidden; a NEW customer message
 * (fresh lastMessageAt) re-arms it. This is what lets the noise stop by itself.
 */

export interface HandoffConversationLike {
  id: string;
  status: string;
  /** Permanent Staff/Supplier AI lock — such conversations never drive the alarm. */
  aiLocked?: boolean | null;
  /** Set when an operator acknowledged the alarm ("Estou ciente"); silences it
   *  app-wide until a fresh escalation clears it. */
  handoffAlarmAckAt?: string | Date | null;
  /** Last activity timestamp — drives the stale auto-silence window below. */
  lastMessageAt?: string | Date | null;
}

export interface HandoffRingOptions {
  /** Epoch ms treated as "now" (defaults to Date.now()). */
  now?: number;
  /** Stop the SOUND for conversations whose lastMessageAt is older than this many
   *  ms (customer long gone). 0/undefined = no age cap (original behaviour). */
  maxAgeMs?: number;
}

export const HANDOFF_REQUEST_STATUS = "HUMAN";

/** VISUAL window: how long a handoff stays in the "🙋 aguardando atendimento
 *  humano" banner/auto-select on the Atendimento screen. Generous on purpose —
 *  visibility should long outlive the noise. */
export const HANDOFF_ALARM_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

/** SOUND window: how long after the conversation's last message the alarm keeps
 *  BEEPING before it auto-silences. Short on purpose (raio-x 2, 2026-07-14): the
 *  sound is a "come look NOW" signal — after this long it is noise, not signal,
 *  and it was beeping on every screen for hours ("apita em página aleatória").
 *  The conversation stays fully visible; answering the customer (auto-ack) or
 *  assuming it stops the sound immediately. */
export const HANDOFF_SOUND_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/** SOUND cap for the overdue (10-min unanswered) escalation: it re-beeps for an
 *  ignored customer, but only while the wait is still recent — a conversation
 *  waiting longer than this stays on the "⏰ atrasados" banner without noise. */
export const OVERDUE_SOUND_MAX_WAIT_MINUTES = 20;

function toMs(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** IDs of conversations with a pending (unassumed) human-attention request.
 *  Excludes already-assumed (HUMANO_ASSUMIU), Staff/equipe (aiLocked), any
 *  conversation an operator acknowledged (handoffAlarmAckAt set), and — when
 *  maxAgeMs is given — any whose customer has been silent past that window. */
export function pendingHumanRequestIds(
  conversations: HandoffConversationLike[],
  opts: HandoffRingOptions = {},
): string[] {
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? 0;
  return conversations
    .filter((c) => {
      if (c.status !== HANDOFF_REQUEST_STATUS || c.aiLocked || c.handoffAlarmAckAt) return false;
      if (maxAgeMs > 0) {
        const last = toMs(c.lastMessageAt);
        if (last !== null && now - last > maxAgeMs) return false; // customer long gone → stop the noise
      }
      return true;
    })
    .map((c) => c.id);
}
