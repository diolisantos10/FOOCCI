/**
 * CRM dedupe + override policy readers (PURE). Defaults are anti-spam by design:
 * a new campaign does NOT re-contact customers already impacted by the same
 * concept or message, unless the operator explicitly opts in.
 */

export interface DedupePolicy {
  /** Suppress customers already impacted by this campaignFamilyKey. */
  dedupeByConcept: boolean;
  /** Suppress customers who already received the same/near-same message. */
  dedupeByMessage: boolean;
  /** Window in days for concept/message dedupe (0 = lifetime). */
  dedupeWindowDays: number;
  /** Explicit opt-in to resend to already-impacted customers. */
  allowResendToImpacted: boolean;
}

export const DEFAULT_DEDUPE_POLICY: Readonly<DedupePolicy> = {
  dedupeByConcept: true,
  dedupeByMessage: true,
  dedupeWindowDays: 30,
  allowResendToImpacted: false,
};

export function readDedupePolicy(raw: unknown): DedupePolicy {
  const d = DEFAULT_DEDUPE_POLICY;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    dedupeByConcept: typeof r.dedupeByConcept === "boolean" ? r.dedupeByConcept : d.dedupeByConcept,
    dedupeByMessage: typeof r.dedupeByMessage === "boolean" ? r.dedupeByMessage : d.dedupeByMessage,
    dedupeWindowDays: typeof r.dedupeWindowDays === "number" ? Math.max(0, Math.floor(r.dedupeWindowDays)) : d.dedupeWindowDays,
    allowResendToImpacted: typeof r.allowResendToImpacted === "boolean" ? r.allowResendToImpacted : d.allowResendToImpacted,
  };
}

export interface OverridePolicy {
  /** May exceed maxPerWeekPerCustomer — for important campaigns (e.g. birthday). */
  allowWeeklyCustomerCapOverride: boolean;
  overrideReason: string | null;
}

export function readOverridePolicy(scheduleConfig: unknown): OverridePolicy {
  const r = (scheduleConfig as Record<string, unknown> | null) ?? {};
  return {
    allowWeeklyCustomerCapOverride: r.allowWeeklyCustomerCapOverride === true,
    overrideReason: typeof r.overrideReason === "string" ? r.overrideReason : null,
  };
}
