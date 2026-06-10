/**
 * WhatsAppAiReturnPolicy — when may a HUMAN-mode conversation become eligible for
 * the AI again, so a customer never stays stuck on a human forever?
 *
 * PURE function: it only computes ELIGIBILITY. It does NOT flip aiEnabled, does
 * NOT send anything, does NOT touch the runtime. Acting on the eligibility (and
 * any system-timeline event like `[ai_return:auto_timeout]`) is a separate,
 * governed step — out of scope for this round.
 */

export type AiReturnReason =
  | "NEW_DAY"
  | "INACTIVITY_12H"
  | "CUSTOMER_REOPENED"
  | "LOCKED"
  | "RECENT_HUMAN_ACTIVITY"
  | "CRITICAL_HANDOFF"
  | "NOT_HUMAN";

export interface AiReturnInput {
  status: string;
  aiLocked: boolean;
  conversationType: string;
  /** Last message sent by a human/operator (or the handoff time as fallback). */
  lastHumanActivityAt: Date | null;
  /** Last inbound message from the customer (optional). */
  lastCustomerMessageAt?: Date | null;
  /** The reason recorded on the last handoff (e.g. COMPLAINT). */
  lastHandoffReason?: string | null;
  now?: Date;
}

export interface AiReturnDecision {
  shouldReturnToAi: boolean;
  reason: AiReturnReason;
  /** Hard invariant: deciding eligibility NEVER touches the runtime. */
  runtimeTouched: false;
}

const HUMAN_STATUSES = new Set(["HUMAN", "HUMANO_ASSUMIU"]);
const CRITICAL_REASONS = new Set(["COMPLAINT", "CRITICAL"]);
const INACTIVITY_MS = 12 * 60 * 60 * 1000;

/** Same operational day in America/Sao_Paulo (UTC-3, no DST today). */
function sameOperationalDay(a: Date, b: Date): boolean {
  const toBrtDay = (d: Date) => {
    const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return `${brt.getUTCFullYear()}-${brt.getUTCMonth()}-${brt.getUTCDate()}`;
  };
  return toBrtDay(a) === toBrtDay(b);
}

export function evaluateAiReturn(input: AiReturnInput): AiReturnDecision {
  const now = input.now ?? new Date();
  const done = (shouldReturnToAi: boolean, reason: AiReturnReason): AiReturnDecision => ({
    shouldReturnToAi,
    reason,
    runtimeTouched: false,
  });

  // 1) Permanent lock — never returns automatically.
  if (input.aiLocked) return done(false, "LOCKED");
  // 2) Non-customer context is locked to the operator.
  if (input.conversationType && input.conversationType !== "CUSTOMER") return done(false, "LOCKED");
  // 3) Only HUMAN-mode conversations are candidates.
  if (!HUMAN_STATUSES.has(input.status)) return done(false, "NOT_HUMAN");
  // 6) Critical/complaint handoff: an operator must close it — no auto return.
  if (input.lastHandoffReason && CRITICAL_REASONS.has(input.lastHandoffReason.toUpperCase())) {
    return done(false, "CRITICAL_HANDOFF");
  }

  const since = input.lastHumanActivityAt;
  // Without a reference time we stay safe (treat as recent human activity).
  if (!since) return done(false, "RECENT_HUMAN_ACTIVITY");

  const elapsed = now.getTime() - since.getTime();

  // 5) Customer reopened after a long silence (>= 12h) since the human.
  if (input.lastCustomerMessageAt && input.lastCustomerMessageAt.getTime() > since.getTime() && elapsed >= INACTIVITY_MS) {
    return done(true, "CUSTOMER_REOPENED");
  }
  // 4) 12h of inactivity since the last human activity.
  if (elapsed >= INACTIVITY_MS) return done(true, "INACTIVITY_12H");
  // 3') New operational day with no recent human activity.
  if (!sameOperationalDay(now, since)) return done(true, "NEW_DAY");

  // Otherwise the human is still recently active.
  return done(false, "RECENT_HUMAN_ACTIVITY");
}
