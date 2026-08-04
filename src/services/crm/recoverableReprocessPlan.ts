/**
 * Recoverable reprocess plan — the single server-side source of truth for which
 * recipients a "Reprocessar falhas recuperáveis" run would attempt.
 *
 * Pure module (no DB, no network) so it is unit-testable and so the preview (GET)
 * and the live send (POST) compute the EXACT same plan from the same rows. The
 * POST never trusts the client; it recomputes this from fresh DB rows at request
 * time.
 *
 * Recoverable = transient provider failures only (classifyExecution → kind FAILED
 * + retryability RETRYABLE_LATER: generic 5xx, timeout, unknown). This intentionally
 * EXCLUDES, by construction:
 *   - opt-out (NEVER_RETRY)
 *   - invalid phone / no phone / not contactable (SKIPPED / RETRYABLE_AFTER_FIX)
 *   - HTTP 400 / auth / instance disconnected (RETRYABLE_AFTER_FIX)
 *   - already-successfully-sent recipients (kind SENT)
 *   - safety blocks (kind BLOCKED)
 */

import { classifyExecution } from "./crmExecutionClassification";
import { normalizePhoneForEvolution } from "@/lib/crm/normalizePhone";

export interface PlanExecutionRow {
  id: string;
  customerId: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  status: string;
  failedReason?: string | null;
  errorMessage?: string | null;
}

export interface PlanRecipient {
  executionId:   string;
  customerId:    string;
  customerName:  string;
  customerPhone: string;
}

export interface RecoverablePlan {
  /** Recoverable execution rows mapping to retryable recipients (post-exclusions, pre-dedupe). */
  recoverableExecutions: number;
  /** Unique recipients after dedupe by customerId + normalized phone. */
  distinctRecipients: number;
  /** recoverableExecutions − distinctRecipients. */
  duplicatesRemoved: number;
  /** Hard provider cap per run. */
  cap: number;
  /** The only recipients a single run will attempt — capped. */
  nextBatch: PlanRecipient[];
  /** nextBatch.length (≤ cap). */
  nextBatchCount: number;
}

/**
 * Computes the recoverable plan from a campaign's execution rows.
 * `rows` SHOULD be ordered oldest-first so the longest-waiting recipients are
 * retried first; dedupe preserves first occurrence.
 */
export function computeRecoverablePlan(rows: PlanExecutionRow[], cap: number): RecoverablePlan {
  const safeCap = Math.max(0, Math.floor(cap));

  // Recipients already successfully contacted on this campaign — NEVER resend,
  // even if they also have an earlier transient-failure row.
  const sentCustomerIds = new Set<string>();
  for (const r of rows) {
    if (r.customerId && classifyExecution(r).kind === "SENT") sentCustomerIds.add(r.customerId);
  }

  const recoverable = rows.filter((r) => {
    if (!r.customerId || sentCustomerIds.has(r.customerId)) return false;
    if (!(r.customerPhone ?? "").trim()) return false; // need a phone to send
    const c = classifyExecution(r);
    return c.kind === "FAILED" && c.retryability === "RETRYABLE_LATER";
  });

  // Dedupe by customerId AND normalized phone (two cadastros sharing a number
  // must not both receive). Preserve input order (oldest-first).
  const seenCustomer = new Set<string>();
  const seenPhone = new Set<string>();
  const deduped: PlanRecipient[] = [];
  for (const r of recoverable) {
    const customerId = r.customerId as string;
    const phoneKey = normalizePhoneForEvolution(r.customerPhone ?? "");
    if (seenCustomer.has(customerId)) continue;
    if (phoneKey && seenPhone.has(phoneKey)) continue;
    seenCustomer.add(customerId);
    if (phoneKey) seenPhone.add(phoneKey);
    deduped.push({
      executionId:   r.id,
      customerId,
      customerName:  r.customerName ?? "",
      customerPhone: r.customerPhone ?? "",
    });
  }

  const recoverableExecutions = recoverable.length;
  const distinctRecipients = deduped.length;
  return {
    recoverableExecutions,
    distinctRecipients,
    duplicatesRemoved: Math.max(0, recoverableExecutions - distinctRecipients),
    cap: safeCap,
    nextBatch: deduped.slice(0, safeCap),
    nextBatchCount: Math.min(distinctRecipients, safeCap),
  };
}

// ── Reprocess authorization guard (pure) ──────────────────────────────────────

export type ReprocessBlockReason =
  | "NOT_CONFIRMED"
  | "CAMPAIGN_NOT_REPROCESSABLE"
  | "NO_RECOVERABLE"
  | "INSTANCE_NOT_CONNECTED";

/** Campaign statuses for which reprocessing already-attempted recipients is valid.
 *  DRAFT (never launched), SENDING (a run is in progress → no parallel sends) and
 *  CANCELLED are intentionally excluded. */
export const REPROCESSABLE_CAMPAIGN_STATUSES: ReadonlySet<string> = new Set([
  "ACTIVE",
  "SCHEDULED",
  "PAUSED",
  "SENT",
  "COMPLETED",
]);

export interface ReprocessGuardInput {
  confirm:        unknown;
  campaignStatus: string;
  nextBatchCount: number;
  /**
   * Canal WhatsApp oficial conectado. `null` = **não foi possível saber**, e isso
   * bloqueia igual a desconectado: ausência de informação não é informação.
   * (Antes este campo era a string de estado da instância Evolution, "open".)
   */
  channelConnected: boolean | null;
}

export type ReprocessGuardResult =
  | { ok: true }
  | { ok: false; reason: ReprocessBlockReason; message: string };

/**
 * Decides whether a confirmed live reprocess may proceed. Pure — the route/service
 * supplies the freshly-computed batch count and the live channel state.
 */
export function assertReprocessAllowed(input: ReprocessGuardInput): ReprocessGuardResult {
  if (input.confirm !== true) {
    return { ok: false, reason: "NOT_CONFIRMED", message: "Confirmação explícita obrigatória ({ confirm: true })." };
  }
  if (!REPROCESSABLE_CAMPAIGN_STATUSES.has(input.campaignStatus)) {
    return { ok: false, reason: "CAMPAIGN_NOT_REPROCESSABLE", message: `Campanha em status ${input.campaignStatus} não pode reprocessar.` };
  }
  if (input.nextBatchCount <= 0) {
    return { ok: false, reason: "NO_RECOVERABLE", message: "Nenhum destinatário recuperável no próximo lote." };
  }
  if (input.channelConnected !== true) {
    return {
      ok: false,
      reason: "INSTANCE_NOT_CONNECTED",
      message: input.channelConnected === null
        ? "Não foi possível confirmar a conexão do WhatsApp — reprocessamento bloqueado."
        : "WhatsApp (Meta) não está conectado.",
    };
  }
  return { ok: true };
}
