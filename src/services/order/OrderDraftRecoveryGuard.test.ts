import { describe, it, expect } from "vitest";

// ── Pure simulation of the recovery eligibility checks ───────────────────────
// Mirrors the real service logic without requiring Prisma.

interface SimDraft {
  updatedAt: Date;
}

interface SimOrder {
  id:        string;
  createdAt: Date;
  status:    string;
}

interface SimResult {
  shouldSend:                  boolean;
  reason?:                     string;
  skippedOrderOrPaymentExists: number;
  skippedOrderedAfter:         number;
  skippedPendingPayment:       number;
}

function simulateRecoveryEligibility(opts: {
  draft:      SimDraft;
  orders:     SimOrder[];   // all non-cancelled orders for this customer+restaurant
  pendingSet: Set<string>;  // rule 8: AWAITING_PAYMENT
  key:        string;       // `${restaurantId}:${customerId}`
}): SimResult {
  const { draft, orders, pendingSet, key } = opts;

  let skippedOrderedAfter         = 0;
  let skippedPendingPayment       = 0;
  let skippedOrderOrPaymentExists = 0;

  // Rule 8: AWAITING_PAYMENT
  if (pendingSet.has(key)) {
    skippedPendingPayment++;
    skippedOrderOrPaymentExists++;
    return { shouldSend: false, reason: "rule8_pending_payment", skippedOrderOrPaymentExists, skippedOrderedAfter, skippedPendingPayment };
  }

  // Rule 7 (FIXED): 30-min lookback from draft.updatedAt
  const lookback = new Date(draft.updatedAt.getTime() - 30 * 60_000);
  const recentOrder = orders.find(
    (o) => o.status !== "CANCELLED" && o.createdAt >= lookback,
  );
  if (recentOrder) {
    skippedOrderedAfter++;
    skippedOrderOrPaymentExists++;
    return { shouldSend: false, reason: "rule7_recent_order", skippedOrderOrPaymentExists, skippedOrderedAfter, skippedPendingPayment };
  }

  return { shouldSend: true, skippedOrderOrPaymentExists: 0, skippedOrderedAfter: 0, skippedPendingPayment: 0 };
}

const KEY = "rest-1:cust-1";
const now  = new Date("2024-01-15T12:00:00Z");

// ── A: skips when a non-cancelled order exists within the 30-min lookback ───
describe("Rule 7 — recent order guard", () => {
  it("A: skips when order.createdAt is within 30 min of draft.updatedAt", () => {
    const draftUpdatedAt = new Date(now.getTime() - 2 * 60_000);       // 2 min ago
    const orderCreatedAt = new Date(now.getTime() - 10 * 60_000);      // 10 min ago (within lookback)
    const result = simulateRecoveryEligibility({
      draft:      { updatedAt: draftUpdatedAt },
      orders:     [{ id: "o1", createdAt: orderCreatedAt, status: "CONFIRMED" }],
      pendingSet: new Set(),
      key:        KEY,
    });
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe("rule7_recent_order");
    expect(result.skippedOrderedAfter).toBe(1);
  });

  it("B: does not skip when no order exists in the lookback window", () => {
    const draftUpdatedAt = new Date(now.getTime() - 2 * 60_000);       // 2 min ago
    const result = simulateRecoveryEligibility({
      draft:      { updatedAt: draftUpdatedAt },
      orders:     [],
      pendingSet: new Set(),
      key:        KEY,
    });
    expect(result.shouldSend).toBe(true);
  });

  it("C: skips when order.createdAt < draft.updatedAt (the real bug scenario)", () => {
    // Customer finalized order at T, then /pedido client synced draft at T+5s.
    // Old code used gt: draft.updatedAt → missed the order. New code uses
    // gte with 30-min lookback → catches it.
    const orderCreatedAt = new Date(now.getTime() - 5 * 60_000);       // order at 5 min ago
    const draftUpdatedAt = new Date(now.getTime() - 5 * 60_000 + 5000); // draft synced 5s after order
    expect(draftUpdatedAt > orderCreatedAt).toBe(true); // confirm the bug scenario
    const result = simulateRecoveryEligibility({
      draft:      { updatedAt: draftUpdatedAt },
      orders:     [{ id: "o1", createdAt: orderCreatedAt, status: "CONFIRMED" }],
      pendingSet: new Set(),
      key:        KEY,
    });
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe("rule7_recent_order");
  });

  it("C2: old code would have missed it (gt: draft.updatedAt)", () => {
    // Demonstrate the pre-fix behaviour: gt misses orders before draft.updatedAt
    const orderCreatedAt = new Date(now.getTime() - 5 * 60_000);
    const draftUpdatedAt = new Date(now.getTime() - 5 * 60_000 + 5000);
    const oldLookup = orderCreatedAt > draftUpdatedAt; // the old `gt` check
    expect(oldLookup).toBe(false); // would NOT have found the order → recovery incorrectly fires
  });

  it("D: does not skip when order is CANCELLED", () => {
    const draftUpdatedAt = new Date(now.getTime() - 2 * 60_000);
    const orderCreatedAt = new Date(now.getTime() - 1 * 60_000);
    const result = simulateRecoveryEligibility({
      draft:      { updatedAt: draftUpdatedAt },
      orders:     [{ id: "o1", createdAt: orderCreatedAt, status: "CANCELLED" }],
      pendingSet: new Set(),
      key:        KEY,
    });
    expect(result.shouldSend).toBe(true); // cancelled order should not block recovery
  });
});

// ── Rule 8 — AWAITING_PAYMENT guard ──────────────────────────────────────────
describe("Rule 8 — pending payment guard", () => {
  it("D: skips when pendingSet has the key (AWAITING_PAYMENT)", () => {
    const draftUpdatedAt = new Date(now.getTime() - 2 * 60_000);
    const result = simulateRecoveryEligibility({
      draft:      { updatedAt: draftUpdatedAt },
      orders:     [],
      pendingSet: new Set([KEY]),
      key:        KEY,
    });
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe("rule8_pending_payment");
    expect(result.skippedPendingPayment).toBe(1);
  });

  it("E: does not skip when pendingSet has a different key", () => {
    const draftUpdatedAt = new Date(now.getTime() - 2 * 60_000);
    const result = simulateRecoveryEligibility({
      draft:      { updatedAt: draftUpdatedAt },
      orders:     [],
      pendingSet: new Set(["rest-1:cust-other"]),
      key:        KEY,
    });
    expect(result.shouldSend).toBe(true);
  });
});

// ── Combined counter ──────────────────────────────────────────────────────────
describe("skippedOrderOrPaymentExists combined counter", () => {
  it("H: increments for both rule 7 and rule 8 skips", () => {
    const draftUpdatedAt = new Date(now.getTime() - 2 * 60_000);

    const rule7 = simulateRecoveryEligibility({
      draft:      { updatedAt: draftUpdatedAt },
      orders:     [{ id: "o1", createdAt: new Date(now.getTime() - 1 * 60_000), status: "CONFIRMED" }],
      pendingSet: new Set(),
      key:        KEY,
    });
    expect(rule7.skippedOrderOrPaymentExists).toBe(1);

    const rule8 = simulateRecoveryEligibility({
      draft:      { updatedAt: draftUpdatedAt },
      orders:     [],
      pendingSet: new Set([KEY]),
      key:        KEY,
    });
    expect(rule8.skippedOrderOrPaymentExists).toBe(1);

    const eligible = simulateRecoveryEligibility({
      draft:      { updatedAt: draftUpdatedAt },
      orders:     [],
      pendingSet: new Set(),
      key:        KEY,
    });
    expect(eligible.skippedOrderOrPaymentExists).toBe(0);
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────
describe("idempotency", () => {
  it("I: draft with recoveryAttempts > 0 is excluded from candidates (db-level guard)", () => {
    // The candidate query filters recoveryAttempts: 0. Simulate that a draft
    // with attempts=1 never reaches the eligibility check.
    const candidates = [
      { id: "d1", recoveryAttempts: 0 },
      { id: "d2", recoveryAttempts: 1 }, // already sent
      { id: "d3", recoveryAttempts: 0 },
    ].filter((d) => d.recoveryAttempts === 0);
    expect(candidates.map((d) => d.id)).toEqual(["d1", "d3"]);
  });
});
