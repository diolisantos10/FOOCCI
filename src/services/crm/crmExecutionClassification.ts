/**
 * CRM execution classification — the single source of truth that separates a real
 * SEND FAILURE from an expected SAFETY BLOCK.
 *
 * A campaign execution today is stored as a status + failedReason (human) +
 * errorMessage (machine ContactBlockReason, for new rows). This module maps any
 * execution — new (status BLOCKED + machine code) OR legacy (status FAILED + human
 * text like "Limite semanal atingido (1/1)") — into a clear category, so the UI
 * never again shows a weekly-cap block as a "failure".
 *
 * Pure module: no DB, no side effects.
 */

export type ExecutionCategory =
  | "SENT"
  | "FAILED_PROVIDER"
  | "BLOCKED_SAFETY"
  | "BLOCKED_COOLDOWN"
  | "BLOCKED_WEEKLY_LIMIT"
  | "BLOCKED_DAILY_GLOBAL_CAP"
  | "BLOCKED_CAMPAIGN_DAILY_LIMIT"
  | "BLOCKED_OPT_OUT"
  | "BLOCKED_INVALID_PHONE"
  | "SKIPPED_NOT_ELIGIBLE";

/** Coarse kind used by the UI to pick a badge colour/word. */
export type ExecutionKind = "SENT" | "BLOCKED" | "FAILED" | "SKIPPED";

export interface ExecutionInput {
  status: string;
  failedReason?: string | null;
  errorMessage?: string | null;
}

export interface ExecutionClassification {
  category: ExecutionCategory;
  kind: ExecutionKind;
  /** Short PT-BR badge word. */
  badge: string;
}

const CATEGORY_META: Record<ExecutionCategory, { kind: ExecutionKind; badge: string }> = {
  SENT: { kind: "SENT", badge: "Enviado" },
  FAILED_PROVIDER: { kind: "FAILED", badge: "Falhou" },
  BLOCKED_INVALID_PHONE: { kind: "FAILED", badge: "Telefone inválido" },
  BLOCKED_SAFETY: { kind: "BLOCKED", badge: "Bloqueado" },
  BLOCKED_COOLDOWN: { kind: "BLOCKED", badge: "Bloqueado (cooldown)" },
  BLOCKED_WEEKLY_LIMIT: { kind: "BLOCKED", badge: "Bloqueado (limite semanal)" },
  BLOCKED_DAILY_GLOBAL_CAP: { kind: "BLOCKED", badge: "Bloqueado (cap global)" },
  BLOCKED_CAMPAIGN_DAILY_LIMIT: { kind: "BLOCKED", badge: "Bloqueado (limite da campanha)" },
  BLOCKED_OPT_OUT: { kind: "BLOCKED", badge: "Opt-out" },
  SKIPPED_NOT_ELIGIBLE: { kind: "SKIPPED", badge: "Ignorado" },
};

/** Maps a machine ContactBlockReason to a category. */
function fromMachineReason(reason: string): ExecutionCategory | null {
  switch (reason) {
    case "CUSTOMER_WEEKLY_CAP_REACHED": return "BLOCKED_WEEKLY_LIMIT";
    case "CUSTOMER_COOLDOWN_ACTIVE":
    case "RECENT_CRM_MESSAGE_24H": return "BLOCKED_COOLDOWN";
    case "DAILY_GLOBAL_CAP_REACHED": return "BLOCKED_DAILY_GLOBAL_CAP";
    case "CUSTOMER_OPTED_OUT": return "BLOCKED_OPT_OUT";
    case "MISSING_PHONE":
    case "INVALID_PHONE_FORMAT": return "BLOCKED_INVALID_PHONE";
    case "CUSTOMER_NOT_CONTACTABLE":
    case "NO_EVOLUTION_CONFIG":
    case "QUIET_HOURS":
    case "WEEKEND_BLOCKED":
    case "OUTSIDE_SENDING_WINDOW":
    case "DUPLICATE_CAMPAIGN_RECIPIENT":
    case "RESTAURANT_CLOSED":
    case "UNKNOWN_ERROR": return "BLOCKED_SAFETY";
    default: return null;
  }
}

/** Best-effort mapping of a free-text reason (legacy FAILED rows / provider errors). */
function fromText(text: string): ExecutionCategory {
  const t = text.toLowerCase();
  // Safety blocks recorded as FAILED in legacy data.
  if (t.includes("limite semanal") || t.includes("weekly")) return "BLOCKED_WEEKLY_LIMIT";
  if (t.includes("opt-out") || t.includes("opt out") || t.includes("optou")) return "BLOCKED_OPT_OUT";
  if (t.includes("cooldown") || t.includes("recente") || t.includes("24h") || t.includes("intervalo")) return "BLOCKED_COOLDOWN";
  if (t.includes("cap global") || t.includes("global")) return "BLOCKED_DAILY_GLOBAL_CAP";
  if (t.includes("limite diário") || t.includes("limite diario") || t.includes("daily limit")) return "BLOCKED_CAMPAIGN_DAILY_LIMIT";
  if (t.includes("quiet") || t.includes("silenc") || t.includes("janela") || t.includes("weekend") || t.includes("fim de semana") || t.includes("duplicad")) return "BLOCKED_SAFETY";
  // Provider failures — distinguish an invalid-number error from a generic 4xx/5xx.
  const looksLikePhoneError =
    t.includes("invalid number") || t.includes("número inválido") || t.includes("numero invalido") ||
    t.includes("not a valid") || t.includes("jid") || t.includes("não existe no whatsapp") || t.includes("exists\":false");
  if (looksLikePhoneError) return "BLOCKED_INVALID_PHONE";
  if (t.includes("http") || t.includes("evolution") || t.includes("timeout") || t.includes("econn")) return "FAILED_PROVIDER";
  return "FAILED_PROVIDER";
}

/** Classifies one execution row. Never throws. */
export function classifyExecution(input: ExecutionInput): ExecutionClassification {
  const status = (input.status ?? "").toUpperCase();
  if (status === "SENT" || status === "DELIVERED" || status === "READ") {
    return { category: "SENT", ...CATEGORY_META.SENT };
  }
  if (status === "SKIPPED") {
    return { category: "SKIPPED_NOT_ELIGIBLE", ...CATEGORY_META.SKIPPED_NOT_ELIGIBLE };
  }

  // Prefer the machine reason (new rows store it on errorMessage).
  const machine = (input.errorMessage ?? "").trim();
  let category = machine ? fromMachineReason(machine) : null;

  // BLOCKED status without a recognized machine code → generic safety block.
  if (!category && status === "BLOCKED") category = "BLOCKED_SAFETY";

  // FAILED/PENDING (legacy) → classify from the human text.
  if (!category) {
    const text = `${input.errorMessage ?? ""} ${input.failedReason ?? ""}`.trim();
    category = text ? fromText(text) : "FAILED_PROVIDER";
  }

  return { category, ...CATEGORY_META[category] };
}

export interface ExecutionSummary {
  total: number;
  sent: number;
  blockedSafety: number;
  failedProvider: number;
  /** Count per fine-grained category. */
  byCategory: Record<ExecutionCategory, number>;
  /** Human-friendly reason groups for the UI ("Limite semanal: X", ...). */
  reasonGroups: Array<{ category: ExecutionCategory; badge: string; count: number; kind: ExecutionKind }>;
}

const EMPTY_BY_CATEGORY = (): Record<ExecutionCategory, number> => ({
  SENT: 0, FAILED_PROVIDER: 0, BLOCKED_SAFETY: 0, BLOCKED_COOLDOWN: 0, BLOCKED_WEEKLY_LIMIT: 0,
  BLOCKED_DAILY_GLOBAL_CAP: 0, BLOCKED_CAMPAIGN_DAILY_LIMIT: 0, BLOCKED_OPT_OUT: 0,
  BLOCKED_INVALID_PHONE: 0, SKIPPED_NOT_ELIGIBLE: 0,
});

/** Aggregates a list of executions into the split the Performance UI needs. */
export function summarizeExecutions(rows: ExecutionInput[]): ExecutionSummary {
  const byCategory = EMPTY_BY_CATEGORY();
  for (const r of rows) byCategory[classifyExecution(r).category] += 1;

  let sent = 0, blockedSafety = 0, failedProvider = 0;
  for (const cat of Object.keys(byCategory) as ExecutionCategory[]) {
    const n = byCategory[cat];
    const kind = CATEGORY_META[cat].kind;
    if (kind === "SENT") sent += n;
    else if (kind === "BLOCKED") blockedSafety += n;
    else if (kind === "FAILED") failedProvider += n; // includes BLOCKED_INVALID_PHONE (a real provider/phone failure)
  }

  const reasonGroups = (Object.keys(byCategory) as ExecutionCategory[])
    .filter((c) => byCategory[c] > 0 && c !== "SENT")
    .map((c) => ({ category: c, badge: CATEGORY_META[c].badge, count: byCategory[c], kind: CATEGORY_META[c].kind }))
    .sort((a, b) => b.count - a.count);

  return { total: rows.length, sent, blockedSafety, failedProvider, byCategory, reasonGroups };
}

/** Aggregates pre-grouped { reason → count } maps (from a DB groupBy). */
export function summarizeFromReasonCounts(
  groups: Array<{ status: string; failedReason?: string | null; errorMessage?: string | null; count: number }>,
): ExecutionSummary {
  const byCategory = EMPTY_BY_CATEGORY();
  for (const g of groups) byCategory[classifyExecution(g).category] += g.count;
  const rows: ExecutionInput[] = [];
  // Rebuild a flat summary using the per-category counts.
  let sent = 0, blockedSafety = 0, failedProvider = 0, total = 0;
  for (const cat of Object.keys(byCategory) as ExecutionCategory[]) {
    const n = byCategory[cat];
    total += n;
    const kind = CATEGORY_META[cat].kind;
    if (kind === "SENT") sent += n;
    else if (kind === "BLOCKED") blockedSafety += n;
    else if (kind === "FAILED") failedProvider += n;
  }
  void rows;
  const reasonGroups = (Object.keys(byCategory) as ExecutionCategory[])
    .filter((c) => byCategory[c] > 0 && c !== "SENT")
    .map((c) => ({ category: c, badge: CATEGORY_META[c].badge, count: byCategory[c], kind: CATEGORY_META[c].kind }))
    .sort((a, b) => b.count - a.count);
  return { total, sent, blockedSafety, failedProvider, byCategory, reasonGroups };
}
