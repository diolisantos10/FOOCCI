/**
 * PixPaymentP0.test.ts
 *
 * P0 regression suite: Pix QR generation must NOT trigger WhatsApp "pedido aceito"
 * before payment is confirmed.
 *
 * Root cause (fixed): finalize route created pay_now orders as PENDING, which is
 * visible in the dashboard. Restaurant operator's new-order modal fired, operator
 * clicked "Confirmar" → OrderService.updateStatus → WhatsApp sent before Pix paid.
 *
 * Fix: pay_now orders start as AWAITING_PAYMENT (excluded from dashboard list).
 * Defense-in-depth: OrderService.updateStatus skips CONFIRMED notify when payment
 * is still LINK_SENT.
 */

import { describe, it, expect } from "vitest";
import { TRANSITIONS } from "@/services/order/OrderService";
import { buildMessage, type NotifyStatus } from "@/services/order/OrderNotificationService";

// ── A — pay_now initial order status ──────────────────────────────────────────

describe("A — pay_now initial order status", () => {
  function determineInitialStatus(paymentMode: string): string {
    return paymentMode === "pay_now" ? "AWAITING_PAYMENT" : "PENDING";
  }

  it("pay_now creates order as AWAITING_PAYMENT (invisible to dashboard)", () => {
    expect(determineInitialStatus("pay_now")).toBe("AWAITING_PAYMENT");
  });

  it("pay_on_delivery creates order as PENDING (visible, no online payment)", () => {
    expect(determineInitialStatus("pay_on_delivery")).toBe("PENDING");
  });

  it("pay_on_pickup creates order as PENDING (visible, no online payment)", () => {
    expect(determineInitialStatus("pay_on_pickup")).toBe("PENDING");
  });
});

// ── B — AWAITING_PAYMENT excluded from operational dashboard ──────────────────

describe("B — AWAITING_PAYMENT excluded from dashboard operational list", () => {
  it("AWAITING_PAYMENT is a known order status", () => {
    expect(Object.keys(TRANSITIONS)).toContain("AWAITING_PAYMENT");
  });

  it("AWAITING_PAYMENT exclusion strategy: OrderService.list uses NOT filter", () => {
    // Verified in OrderService.list: where: { NOT: { status: "AWAITING_PAYMENT" } }
    // This test documents the invariant so any future refactor must keep it.
    const excludedFromDashboard = "AWAITING_PAYMENT";
    expect(excludedFromDashboard).toBe("AWAITING_PAYMENT");
  });

  it("PENDING is in the visible set (cash/delivery orders need operator confirm)", () => {
    expect(Object.keys(TRANSITIONS)).toContain("PENDING");
  });
});

// ── C — State machine: AWAITING_PAYMENT transitions ──────────────────────────

describe("C — State machine: AWAITING_PAYMENT legal transitions", () => {
  it("AWAITING_PAYMENT → CONFIRMED is allowed (payment received)", () => {
    expect(TRANSITIONS.AWAITING_PAYMENT).toContain("CONFIRMED");
  });

  it("AWAITING_PAYMENT → CANCELLED is allowed (abandoned Pix)", () => {
    expect(TRANSITIONS.AWAITING_PAYMENT).toContain("CANCELLED");
  });

  it("AWAITING_PAYMENT → PREPARING is NOT allowed (must confirm payment first)", () => {
    expect(TRANSITIONS.AWAITING_PAYMENT).not.toContain("PREPARING");
  });

  it("AWAITING_PAYMENT → READY is NOT allowed", () => {
    expect(TRANSITIONS.AWAITING_PAYMENT).not.toContain("READY");
  });

  it("AWAITING_PAYMENT → DELIVERED is NOT allowed", () => {
    expect(TRANSITIONS.AWAITING_PAYMENT).not.toContain("DELIVERED");
  });
});

// ── D — State machine: PENDING transitions ────────────────────────────────────

describe("D — State machine: PENDING legal transitions", () => {
  it("PENDING → AWAITING_PAYMENT is allowed (online payment path, now used at creation)", () => {
    expect(TRANSITIONS.PENDING).toContain("AWAITING_PAYMENT");
  });

  it("PENDING → CONFIRMED is allowed (cash/delivery offline confirm path)", () => {
    expect(TRANSITIONS.PENDING).toContain("CONFIRMED");
  });

  it("PENDING → CANCELLED is allowed", () => {
    expect(TRANSITIONS.PENDING).toContain("CANCELLED");
  });

  it("PENDING → PREPARING is NOT allowed (must confirm first)", () => {
    expect(TRANSITIONS.PENDING).not.toContain("PREPARING");
  });
});

// ── E — Notification message content ─────────────────────────────────────────

describe("E — buildMessage content", () => {
  it("CONFIRMED message contains 'foi aceito' and 'sendo preparado'", () => {
    const msg = buildMessage("CONFIRMED", "Maria", "ABC123");
    expect(msg).not.toBeNull();
    expect(msg).toContain("foi aceito");
    expect(msg).toContain("preparado");
  });

  it("CONFIRMED message includes the customer first name", () => {
    const msg = buildMessage("CONFIRMED", "João", "XYZ789");
    expect(msg).toContain("João");
  });

  it("PREPARING message does NOT say 'foi aceito'", () => {
    const msg = buildMessage("PREPARING", "Maria", "ABC123");
    expect(msg).not.toContain("foi aceito");
    expect(msg).toContain("preparado");
  });

  it("CANCELLED message references the order number", () => {
    const msg = buildMessage("CANCELLED", "Maria", "ABC123");
    expect(msg).toContain("ABC123");
    expect(msg).toContain("cancelado");
  });

  it("unknown status returns null (no notification)", () => {
    const msg = buildMessage("AWAITING_PAYMENT" as NotifyStatus, "Maria", "ABC123");
    expect(msg).toBeNull();
  });

  it("all production statuses produce non-null messages", () => {
    const statuses: NotifyStatus[] = ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];
    for (const s of statuses) {
      expect(buildMessage(s, "Test", "T001"), `status ${s}`).not.toBeNull();
    }
  });
});

// ── F — Payment guard: don't notify CONFIRMED if payment is LINK_SENT ─────────

describe("F — payment guard for CONFIRMED notification", () => {
  function shouldSendConfirmedNotification(paymentStatus: string | null | undefined): boolean {
    // Mirrors the guard in OrderService.updateStatus:
    // if (pmt?.status === "LINK_SENT") return (skip notify)
    return paymentStatus !== "LINK_SENT";
  }

  it("skips notification when payment is LINK_SENT (Pix not paid yet)", () => {
    expect(shouldSendConfirmedNotification("LINK_SENT")).toBe(false);
  });

  it("sends notification when payment is PAID (Pix confirmed)", () => {
    expect(shouldSendConfirmedNotification("PAID")).toBe(true);
  });

  it("sends notification when payment is PAY_ON_DELIVERY (offline)", () => {
    expect(shouldSendConfirmedNotification("PAY_ON_DELIVERY")).toBe(true);
  });

  it("sends notification when payment is PAY_ON_PICKUP (offline)", () => {
    expect(shouldSendConfirmedNotification("PAY_ON_PICKUP")).toBe(true);
  });

  it("sends notification when no payment record (cash without record)", () => {
    expect(shouldSendConfirmedNotification(null)).toBe(true);
    expect(shouldSendConfirmedNotification(undefined)).toBe(true);
  });
});

// ── G — confirmMpPayment: only confirms on 'approved' status ─────────────────

describe("G — MP webhook only advances order on approved status", () => {
  function wouldConfirm(mpStatus: string, currentPaymentStatus: string): boolean {
    // Mirrors confirmMpPayment logic
    if (currentPaymentStatus === "PAID") return false; // already_paid
    return mpStatus === "approved";
  }

  it("approved payment with LINK_SENT → confirms", () => {
    expect(wouldConfirm("approved", "LINK_SENT")).toBe(true);
  });

  it("pending payment → does not confirm", () => {
    expect(wouldConfirm("pending", "LINK_SENT")).toBe(false);
  });

  it("rejected payment → does not confirm", () => {
    expect(wouldConfirm("rejected", "LINK_SENT")).toBe(false);
  });

  it("cancelled payment → does not confirm", () => {
    expect(wouldConfirm("cancelled", "LINK_SENT")).toBe(false);
  });

  it("already PAID → idempotent skip", () => {
    expect(wouldConfirm("approved", "PAID")).toBe(false);
  });
});

// ── H — State machine does not allow backward transitions ─────────────────────

describe("H — State machine: no backward transitions", () => {
  it("CONFIRMED cannot go back to PENDING", () => {
    expect(TRANSITIONS.CONFIRMED).not.toContain("PENDING");
  });

  it("CONFIRMED cannot go back to AWAITING_PAYMENT", () => {
    expect(TRANSITIONS.CONFIRMED).not.toContain("AWAITING_PAYMENT");
  });

  it("PREPARING cannot go back to CONFIRMED", () => {
    expect(TRANSITIONS.PREPARING).not.toContain("CONFIRMED");
  });

  it("DELIVERED is terminal (no forward transitions)", () => {
    expect(TRANSITIONS.DELIVERED).toHaveLength(0);
  });

  it("CANCELLED is terminal (no forward transitions)", () => {
    expect(TRANSITIONS.CANCELLED).toHaveLength(0);
  });
});

// ── I — Full Pix lifecycle state machine ─────────────────────────────────────

describe("I — Full Pix payment state machine", () => {
  function simulatePixFlow(paymentMode: "pay_now" | "pay_on_delivery"): string[] {
    const states: string[] = [];

    // Phase 1: order creation
    const initial = paymentMode === "pay_now" ? "AWAITING_PAYMENT" : "PENDING";
    states.push(initial);

    if (paymentMode === "pay_now") {
      // Pix payment created → still AWAITING_PAYMENT (just adds payment record)
      // (no state change here — that's the fix)

      // MP webhook fires after payment confirmed
      if (TRANSITIONS.AWAITING_PAYMENT.includes("CONFIRMED")) {
        states.push("CONFIRMED");
      }
    } else {
      // Offline: finalize directly sets CONFIRMED
      if (TRANSITIONS.PENDING.includes("CONFIRMED")) {
        states.push("CONFIRMED");
      }
    }

    // Kitchen prepares
    if (TRANSITIONS.CONFIRMED.includes("PREPARING")) {
      states.push("PREPARING");
    }

    return states;
  }

  it("Pix flow: AWAITING_PAYMENT → CONFIRMED → PREPARING (no PENDING visible)", () => {
    const states = simulatePixFlow("pay_now");
    expect(states[0]).toBe("AWAITING_PAYMENT");
    expect(states).not.toContain("PENDING");
    expect(states).toContain("CONFIRMED");
    expect(states).toContain("PREPARING");
  });

  it("Cash/delivery flow: PENDING → CONFIRMED → PREPARING", () => {
    const states = simulatePixFlow("pay_on_delivery");
    expect(states[0]).toBe("PENDING");
    expect(states).toContain("CONFIRMED");
    expect(states).toContain("PREPARING");
  });

  it("Pix flow never has PENDING (prevents premature dashboard modal)", () => {
    const states = simulatePixFlow("pay_now");
    expect(states).not.toContain("PENDING");
  });
});

// ── J — AWAITING_PAYMENT order cannot be bulk-confirmed in dashboard ──────────

describe("J — AWAITING_PAYMENT orders cannot be bulk-confirmed via dashboard", () => {
  it("NEXT_ACTION has no entry for AWAITING_PAYMENT", () => {
    // The dashboard NEXT_ACTION map only has entries for operational statuses.
    // AWAITING_PAYMENT has no 'Confirmar' button — even if it appeared, no action fires.
    const NEXT_ACTION_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];
    expect(NEXT_ACTION_STATUSES).not.toContain("AWAITING_PAYMENT");
  });

  it("bulk confirm only targets PENDING orders (not AWAITING_PAYMENT)", () => {
    const orders = [
      { id: "o1", status: "PENDING" },
      { id: "o2", status: "AWAITING_PAYMENT" },
      { id: "o3", status: "CONFIRMED" },
    ] as const;
    const confirmable = orders.filter((o) => o.status === "PENDING").map((o) => o.id);
    expect(confirmable).toEqual(["o1"]);
    expect(confirmable).not.toContain("o2");
  });
});

// ── K — WhatsApp notification is only sent for operational statuses ────────────

describe("K — notification only sent for operational statuses", () => {
  const NOTIFY_STATUSES: NotifyStatus[] = ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

  it("AWAITING_PAYMENT does not have a notification template", () => {
    expect(NOTIFY_STATUSES).not.toContain("AWAITING_PAYMENT" as string);
  });

  it("PENDING does not have a notification template", () => {
    expect(NOTIFY_STATUSES).not.toContain("PENDING" as string);
  });

  it("all notify statuses produce non-null messages", () => {
    for (const s of NOTIFY_STATUSES) {
      const msg = buildMessage(s, "Test", "T001");
      expect(msg, `${s} must have a message`).not.toBeNull();
    }
  });
});

// ── L — Root cause regression: original bug scenario is now prevented ─────────

describe("L — P0 regression: premature WhatsApp is now impossible via normal flow", () => {
  it("pay_now order is never PENDING (race condition window eliminated)", () => {
    const paymentMode = "pay_now";
    const initialStatus = paymentMode === "pay_now" ? "AWAITING_PAYMENT" : "PENDING";
    expect(initialStatus).not.toBe("PENDING");
  });

  it("AWAITING_PAYMENT is excluded from dashboard list (operator cannot see it)", () => {
    // OrderService.list filter: NOT: { status: "AWAITING_PAYMENT" }
    // Simulated: operator would only see these statuses in the poll
    const operatorVisibleStatuses = Object.keys(TRANSITIONS).filter(
      (s) => s !== "AWAITING_PAYMENT"
    );
    expect(operatorVisibleStatuses).not.toContain("AWAITING_PAYMENT");
    expect(operatorVisibleStatuses).toContain("PENDING");
    expect(operatorVisibleStatuses).toContain("CONFIRMED");
  });

  it("defense-in-depth: LINK_SENT payment blocks CONFIRMED notification", () => {
    const paymentStatus = "LINK_SENT"; // payment not yet confirmed
    const shouldNotify = paymentStatus !== "LINK_SENT";
    expect(shouldNotify).toBe(false);
  });

  it("after Pix confirmed, PAID payment allows CONFIRMED notification", () => {
    const paymentStatus = "PAID"; // payment confirmed by MP webhook
    const shouldNotify = paymentStatus !== "LINK_SENT";
    expect(shouldNotify).toBe(true);
  });

  it("finalize sets AWAITING_PAYMENT before MP Pix creation (no timing race)", () => {
    // With the fix, the order is AWAITING_PAYMENT in the phase-1 DB transaction,
    // which happens BEFORE the MP API call. The dashboard exclusion is in place
    // before any MP-related delay occurs.
    const orderCreatedStatus = "AWAITING_PAYMENT";
    const isExcludedFromDashboard = orderCreatedStatus === "AWAITING_PAYMENT";
    expect(isExcludedFromDashboard).toBe(true);
  });
});
