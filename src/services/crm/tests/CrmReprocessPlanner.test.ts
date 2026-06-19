import { describe, it, expect } from "vitest";
import { buildReprocessPlan, type ReprocessExecInput } from "../crmReprocessPlanner";

const PHONE_A = "+55 11 99999-0001";
const PHONE_B = "11999990002";
const PHONE_C = "5511999990003";

function row(p: Partial<ReprocessExecInput>): ReprocessExecInput {
  return {
    id: Math.random().toString(36).slice(2),
    customerId: null,
    customerPhone: PHONE_A,
    status: "FAILED",
    createdAt: new Date("2026-06-19T10:00:00Z"),
    ...p,
  };
}

describe("buildReprocessPlan — recoverable pool + dedupe + caps", () => {
  it("dedupes duplicate failed attempts for the same customer/phone", () => {
    const execs = [
      row({ id: "e1", customerId: "c1", customerPhone: PHONE_A, errorMessage: "EVOLUTION_HTTP_400", failedReason: "Connection Closed", createdAt: new Date("2026-06-19T10:00:00Z") }),
      row({ id: "e2", customerId: "c1", customerPhone: PHONE_A, errorMessage: "EVOLUTION_HTTP_400", failedReason: "Connection Closed", createdAt: new Date("2026-06-19T11:00:00Z") }),
      row({ id: "e3", customerId: "c1", customerPhone: PHONE_A, errorMessage: "EVOLUTION_HTTP_400", failedReason: "Connection Closed", createdAt: new Date("2026-06-19T12:00:00Z") }),
    ];
    const plan = buildReprocessPlan(execs, { batchLimit: 5 });
    expect(plan.recoverableExecutions).toBe(3);
    expect(plan.distinctRecipients).toBe(1);
    expect(plan.duplicatesRemoved).toBe(2);
    expect(plan.eligibleToReprocess).toBe(1);
    expect(plan.nextBatch).toHaveLength(1);
    expect(plan.nextBatch[0]!.maskedPhone).not.toContain("99999"); // masked
  });

  it("excludes opt-out, invalid/no phone, not-contactable, HTTP 400 validation, auth — only RETRYABLE_LATER provider failures remain", () => {
    const execs = [
      row({ id: "ok1", customerId: "c1", customerPhone: PHONE_A, errorMessage: "EVOLUTION_HTTP_500" }),                 // recoverable
      row({ id: "ok2", customerId: "c2", customerPhone: PHONE_B, failedReason: "Error: Connection Closed", errorMessage: "EVOLUTION_HTTP_400" }), // recoverable (session 400)
      row({ id: "opt", customerId: "c3", customerPhone: PHONE_C, status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT" }),
      row({ id: "inv", customerId: "c4", customerPhone: "123",  status: "SKIPPED", errorMessage: "INVALID_PHONE_FORMAT" }),
      row({ id: "nop", customerId: "c5", customerPhone: "",     status: "SKIPPED", errorMessage: "MISSING_PHONE" }),
      row({ id: "ncc", customerId: "c6", customerPhone: PHONE_A, errorMessage: "CUSTOMER_NOT_CONTACTABLE" }),
      row({ id: "v400", customerId: "c7", customerPhone: PHONE_B, errorMessage: "EVOLUTION_HTTP_400", failedReason: "number must be valid" }), // real validation 400
      row({ id: "auth", customerId: "c8", customerPhone: PHONE_C, errorMessage: "EVOLUTION_HTTP_401" }),
    ];
    const plan = buildReprocessPlan(execs, { batchLimit: 5 });
    expect(plan.recoverableExecutions).toBe(2);       // only the 500 + session-400
    expect(plan.distinctRecipients).toBe(2);
    expect(plan.nextBatch.map((b) => b.customerId).sort()).toEqual(["c1", "c2"]);
  });

  it("excludes a recipient already sent successfully AFTER the failure", () => {
    const execs = [
      row({ id: "f1", customerId: "c1", customerPhone: PHONE_A, errorMessage: "EVOLUTION_HTTP_500", createdAt: new Date("2026-06-19T10:00:00Z") }),
      row({ id: "s1", customerId: "c1", customerPhone: PHONE_A, status: "SENT", sentAt: new Date("2026-06-19T11:00:00Z"), createdAt: new Date("2026-06-19T11:00:00Z") }),
      row({ id: "f2", customerId: "c2", customerPhone: PHONE_B, errorMessage: "EVOLUTION_HTTP_500", createdAt: new Date("2026-06-19T10:00:00Z") }),
    ];
    const plan = buildReprocessPlan(execs, { batchLimit: 5 });
    expect(plan.alreadySentExcluded).toBe(1);
    expect(plan.eligibleToReprocess).toBe(1);          // only c2
    expect(plan.nextBatch[0]!.customerId).toBe("c2");
  });

  it("caps the next batch to the Evolution Web limit (5)", () => {
    const execs = Array.from({ length: 14 }, (_, i) =>
      row({ id: `e${i}`, customerId: `c${i}`, customerPhone: `5511999${String(10000 + i)}`, failedReason: "Connection Closed", errorMessage: "EVOLUTION_HTTP_400" }),
    );
    const plan = buildReprocessPlan(execs, { batchLimit: 5 });
    expect(plan.recoverableExecutions).toBe(14);
    expect(plan.distinctRecipients).toBe(14);
    expect(plan.eligibleToReprocess).toBe(14);
    expect(plan.nextBatch).toHaveLength(5);
  });

  it("the 'Pedido de avaliação' shape: 25 recoverable, 14 distinct, 11 duplicates, batch 5", () => {
    // 14 distinct customers; customers 0..10 (11 of them) have a duplicate failed row.
    const execs: ReprocessExecInput[] = [];
    for (let i = 0; i < 14; i++) {
      execs.push(row({ id: `a${i}`, customerId: `c${i}`, customerPhone: `5511999${String(20000 + i)}`, failedReason: "Connection Closed", errorMessage: "EVOLUTION_HTTP_400", createdAt: new Date(`2026-06-19T10:0${i % 6}:00Z`) }));
    }
    for (let i = 0; i < 11; i++) {
      execs.push(row({ id: `b${i}`, customerId: `c${i}`, customerPhone: `5511999${String(20000 + i)}`, failedReason: "Connection Closed", errorMessage: "EVOLUTION_HTTP_400", createdAt: new Date(`2026-06-19T11:0${i % 6}:00Z`) }));
    }
    const plan = buildReprocessPlan(execs, { batchLimit: 5 });
    expect(plan.recoverableExecutions).toBe(25);
    expect(plan.distinctRecipients).toBe(14);
    expect(plan.duplicatesRemoved).toBe(11);
    expect(plan.eligibleToReprocess).toBe(14);
    expect(plan.nextBatch).toHaveLength(5);
    expect(plan.nextBatch.every((b) => b.retryability === "RETRYABLE_LATER")).toBe(true);
  });
});
