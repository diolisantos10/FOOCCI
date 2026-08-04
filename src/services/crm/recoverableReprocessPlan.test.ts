/**
 * computeRecoverablePlan + assertReprocessAllowed — the server-side safety core of
 * the recoverable reprocess SEND.
 *
 * Proves (without any DB or network — no live messages):
 *   - caps at 5
 *   - dedupes duplicate failed executions (by customerId and by phone)
 *   - excludes opt-out / invalid phone / no phone / not contactable
 *   - excludes already-successfully-sent recipients
 *   - does not retry validation 400 (nor auth / disconnected)
 *   - guard blocks without confirm / on disconnected instance / non-reprocessable status / empty batch
 */

import { describe, it, expect } from "vitest";
import {
  computeRecoverablePlan,
  assertReprocessAllowed,
  type PlanExecutionRow,
} from "@/services/crm/recoverableReprocessPlan";

let seq = 0;
function row(over: Partial<PlanExecutionRow> = {}): PlanExecutionRow {
  seq += 1;
  return {
    id:            over.id            ?? `e${seq}`,
    customerId:    over.customerId    ?? `c${seq}`,
    customerName:  over.customerName  ?? "Cliente",
    customerPhone: over.customerPhone ?? `1199999${String(1000 + seq)}`,
    status:        over.status        ?? "FAILED",
    failedReason:  over.failedReason  ?? null,
    errorMessage:  over.errorMessage  ?? "EVOLUTION_HTTP_500", // transient 5xx → recoverable
  };
}

describe("computeRecoverablePlan", () => {
  it("caps nextBatch at the provider cap (5)", () => {
    const rows = Array.from({ length: 9 }, () => row());
    const plan = computeRecoverablePlan(rows, 5);
    expect(plan.distinctRecipients).toBe(9);
    expect(plan.nextBatch).toHaveLength(5);
    expect(plan.nextBatchCount).toBe(5);
  });

  it("dedupes duplicate failed executions for the same customer", () => {
    const rows = [
      row({ id: "a1", customerId: "cust", customerPhone: "11988887777" }),
      row({ id: "a2", customerId: "cust", customerPhone: "11988887777" }),
      row({ id: "a3", customerId: "cust", customerPhone: "11988887777" }),
    ];
    const plan = computeRecoverablePlan(rows, 5);
    expect(plan.recoverableExecutions).toBe(3);
    expect(plan.distinctRecipients).toBe(1);
    expect(plan.duplicatesRemoved).toBe(2);
    expect(plan.nextBatch[0]?.executionId).toBe("a1"); // oldest-first preserved
  });

  it("dedupes two different customers that share a normalized phone", () => {
    const rows = [
      row({ customerId: "c1", customerPhone: "(11) 98888-7777" }),
      row({ customerId: "c2", customerPhone: "5511988887777" }),
    ];
    const plan = computeRecoverablePlan(rows, 5);
    expect(plan.distinctRecipients).toBe(1);
  });

  it("excludes opt-out, invalid phone, no phone, not contactable, validation 400, auth", () => {
    // A plain validation HTTP 400 (bad request) → RETRYABLE_AFTER_FIX, never retried.
    // Instance-disconnected / dropped-session errors are NOT excluded — they are
    // transient (RETRYABLE_LATER) and ARE the recoverable pool; see the
    // "includes transient … session-disconnect" test below.
    const rows = [
      row({ customerId: "ok", errorMessage: "EVOLUTION_HTTP_503" }),       // recoverable
      row({ customerId: "optout", status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT" }),
      row({ customerId: "invalid", status: "SKIPPED", errorMessage: "INVALID_PHONE_FORMAT" }),
      row({ customerId: "nophone", status: "SKIPPED", errorMessage: "MISSING_PHONE", customerPhone: "" }),
      row({ customerId: "notcontact", status: "SKIPPED", errorMessage: "CUSTOMER_NOT_CONTACTABLE" }),
      row({ customerId: "badreq", status: "FAILED", errorMessage: "EVOLUTION_HTTP_400", failedReason: "number must be valid" }),
      row({ customerId: "auth", status: "FAILED", errorMessage: "EVOLUTION_HTTP_403" }),
    ];
    const plan = computeRecoverablePlan(rows, 5);
    expect(plan.distinctRecipients).toBe(1);
    expect(plan.nextBatch[0]?.customerId).toBe("ok");
  });

  it("excludes recipients already successfully sent (even with an earlier failure row)", () => {
    const rows = [
      row({ id: "f1", customerId: "done", errorMessage: "EVOLUTION_HTTP_500" }), // failed earlier
      row({ id: "s1", customerId: "done", status: "SENT", errorMessage: null }),  // later success
      row({ id: "f2", customerId: "pending", errorMessage: "EVOLUTION_HTTP_500" }),
    ];
    const plan = computeRecoverablePlan(rows, 5);
    expect(plan.distinctRecipients).toBe(1);
    expect(plan.nextBatch[0]?.customerId).toBe("pending");
  });

  it("includes transient 5xx / timeout / unknown / session-disconnect (§8)", () => {
    const rows = [
      row({ customerId: "p5xx", errorMessage: "EVOLUTION_HTTP_500" }),
      row({ customerId: "ptimeout", errorMessage: "EVOLUTION_HTTP_504" }),
      row({ customerId: "punknown", status: "FAILED", errorMessage: null, failedReason: "algo estranho" }),
      // Linha histórica: a Evolution embrulhava sessão caída num 400 e a
      // classificação a reclassifica como erro transitório (RETRYABLE_LATER). O
      // provedor saiu, as linhas antigas ficaram — e continuam recuperáveis.
      row({ customerId: "pdisc", status: "FAILED", errorMessage: "EVOLUTION_HTTP_400", failedReason: "Error: Connection Closed" }),
    ];
    const plan = computeRecoverablePlan(rows, 5);
    expect(plan.distinctRecipients).toBe(4);
  });

  it("matches the documented 25 → 14 / 11 shape", () => {
    // 14 distinct customers; 11 of them have a duplicate failed row → 25 recoverable rows.
    const rows: PlanExecutionRow[] = [];
    for (let i = 0; i < 14; i++) rows.push(row({ id: `base${i}`, customerId: `cust${i}`, customerPhone: `1198888${String(1000 + i)}` }));
    for (let i = 0; i < 11; i++) rows.push(row({ id: `dup${i}`, customerId: `cust${i}`, customerPhone: `1198888${String(1000 + i)}` }));
    const plan = computeRecoverablePlan(rows, 5);
    expect(plan.recoverableExecutions).toBe(25);
    expect(plan.distinctRecipients).toBe(14);
    expect(plan.duplicatesRemoved).toBe(11);
    expect(plan.nextBatchCount).toBe(5);
  });
});

describe("assertReprocessAllowed", () => {
  const base = { confirm: true, campaignStatus: "ACTIVE", nextBatchCount: 3, channelConnected: true };

  it("allows a confirmed, connected, reprocessable campaign with a batch", () => {
    expect(assertReprocessAllowed(base)).toEqual({ ok: true });
  });

  it("blocks without explicit confirm:true", () => {
    expect(assertReprocessAllowed({ ...base, confirm: false }).ok).toBe(false);
    expect(assertReprocessAllowed({ ...base, confirm: undefined }).ok).toBe(false);
    expect(assertReprocessAllowed({ ...base, confirm: "true" })).toMatchObject({ reason: "NOT_CONFIRMED" });
  });

  it("blocks a non-reprocessable campaign (DRAFT / SENDING / CANCELLED)", () => {
    for (const s of ["DRAFT", "SENDING", "CANCELLED"]) {
      expect(assertReprocessAllowed({ ...base, campaignStatus: s })).toMatchObject({ reason: "CAMPAIGN_NOT_REPROCESSABLE" });
    }
  });

  it("blocks when there is nothing recoverable", () => {
    expect(assertReprocessAllowed({ ...base, nextBatchCount: 0 })).toMatchObject({ reason: "NO_RECOVERABLE" });
  });

  it("blocks when the WhatsApp channel is not connected", () => {
    expect(assertReprocessAllowed({ ...base, channelConnected: false })).toMatchObject({ reason: "INSTANCE_NOT_CONNECTED" });
  });

  it("blocks when the channel state could NOT be determined (null = fecha o portão)", () => {
    const r = assertReprocessAllowed({ ...base, channelConnected: null });
    expect(r).toMatchObject({ reason: "INSTANCE_NOT_CONNECTED" });
    // A mensagem diferencia "está desconectado" de "não deu para saber" — o lojista
    // precisa saber qual dos dois problemas ele tem.
    expect(r.ok === false && r.message).toMatch(/não foi possível confirmar/i);
  });
});
