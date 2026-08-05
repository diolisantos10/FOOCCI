/**
 * CRM recoverable reprocess planner (pure — no DB, no I/O, no sending).
 *
 * Given a campaign's executions, computes the SAFE reprocess batch:
 *   - only RETRYABLE_LATER provider failures (5xx / timeout / unknown / disconnected)
 *   - excludes opt-out, invalid/no phone, not-contactable, HTTP 400 validation,
 *     auth errors (none of those are kind FAILED + RETRYABLE_LATER)
 *   - requires a currently-valid normalized phone
 *   - excludes recipients who already received the campaign successfully AFTER the
 *     failed attempt (don't re-send a success)
 *   - dedupes by customerId (fallback: normalized phone) — never retry duplicates
 *   - caps the next batch to `opts.batchLimit` (o chamador manda; o default 5 é
 *     herança do provedor aposentado e só vale para quem não informa nada)
 *
 * This NEVER sends; it only describes what a future reprocess would do.
 */

import { classifyExecution } from "./crmExecutionClassification";
import { normalizePhoneBR, isValidPhoneBR } from "@/lib/crm/normalizePhone";
import { maskPhone } from "@/lib/wa-text-ordering-flag";

export interface ReprocessExecInput {
  id: string;
  customerId: string | null;
  customerName?: string | null;
  customerPhone: string | null;
  status: string;
  failedReason?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | string | null;
  createdAt: Date | string;
}

export interface ReprocessBatchItem {
  executionId: string;
  customerId: string | null;
  customerName: string;
  maskedPhone: string;
  reason: string;          // classification badge, e.g. "Instância desconectada"
  retryability: "RETRYABLE_LATER";
}

export interface ReprocessPlan {
  recoverableExecutions: number;  // recoverable rows BEFORE dedupe
  distinctRecipients: number;     // after dedupe by customer/phone
  duplicatesRemoved: number;      // recoverableExecutions - distinctRecipients
  alreadySentExcluded: number;    // recipients dropped because a later success exists
  eligibleToReprocess: number;    // distinct recipients eligible now
  batchLimit: number;
  nextBatch: ReprocessBatchItem[]; // capped to batchLimit
}

function toMs(v: Date | string | null | undefined): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

const SUCCESS_STATUSES = new Set(["SENT", "DELIVERED", "READ"]);

export function buildReprocessPlan(execs: ReprocessExecInput[], opts: { batchLimit?: number } = {}): ReprocessPlan {
  const batchLimit = Math.max(1, opts.batchLimit ?? 5);

  // Latest successful send time per customer and per normalized phone — so we never
  // re-send to someone already reached after their failure.
  const lastSuccessByCustomer = new Map<string, number>();
  const lastSuccessByPhone = new Map<string, number>();
  for (const e of execs) {
    if (!SUCCESS_STATUSES.has((e.status ?? "").toUpperCase())) continue;
    const t = toMs(e.sentAt ?? e.createdAt);
    if (e.customerId) lastSuccessByCustomer.set(e.customerId, Math.max(lastSuccessByCustomer.get(e.customerId) ?? 0, t));
    const np = normalizePhoneBR(e.customerPhone);
    if (np) lastSuccessByPhone.set(np, Math.max(lastSuccessByPhone.get(np) ?? 0, t));
  }

  let recoverableExecutions = 0;
  let alreadySentExcluded = 0;

  // Group recoverable candidates by recipient key, keeping the most recent attempt.
  const byRecipient = new Map<string, { exec: ReprocessExecInput; norm: string; reason: string; t: number }>();

  for (const e of execs) {
    const cls = classifyExecution({ status: e.status, failedReason: e.failedReason, errorMessage: e.errorMessage });
    // Recoverable pool ONLY: real provider failures that are transient.
    if (!(cls.kind === "FAILED" && cls.retryability === "RETRYABLE_LATER")) continue;

    // Must have a currently-valid phone (defensive — invalid would be SKIPPED anyway).
    const norm = normalizePhoneBR(e.customerPhone);
    if (!isValidPhoneBR(norm)) continue;

    recoverableExecutions++;

    const t = toMs(e.sentAt ?? e.createdAt);
    // Drop if this recipient already got a successful send AFTER this failed attempt.
    const succC = e.customerId ? lastSuccessByCustomer.get(e.customerId) ?? 0 : 0;
    const succP = lastSuccessByPhone.get(norm!) ?? 0;
    if (Math.max(succC, succP) > t) { alreadySentExcluded++; continue; }

    const key = e.customerId ? `c:${e.customerId}` : `p:${norm}`;
    const prev = byRecipient.get(key);
    if (!prev || t > prev.t) byRecipient.set(key, { exec: e, norm: norm!, reason: cls.badge, t });
  }

  const distinctRecipients = byRecipient.size;
  const eligibleToReprocess = distinctRecipients;
  const duplicatesRemoved = recoverableExecutions - alreadySentExcluded - distinctRecipients;

  const ordered = [...byRecipient.values()].sort((a, b) => a.t - b.t); // oldest failures first
  const nextBatch: ReprocessBatchItem[] = ordered.slice(0, batchLimit).map((r) => ({
    executionId: r.exec.id,
    customerId:  r.exec.customerId,
    customerName: r.exec.customerName ?? "",
    maskedPhone: maskPhone(r.norm),
    reason:      r.reason,
    retryability: "RETRYABLE_LATER",
  }));

  return {
    recoverableExecutions,
    distinctRecipients,
    duplicatesRemoved: Math.max(0, duplicatesRemoved),
    alreadySentExcluded,
    eligibleToReprocess,
    batchLimit,
    nextBatch,
  };
}
