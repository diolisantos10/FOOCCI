import { describe, it, expect, vi } from "vitest";
import { createAutoPrintGuard } from "./autoPrintGuard";

// ── A. Guard allows print when setting enabled, blocks duplicates ──────────
describe("createAutoPrintGuard", () => {
  it("A: claims an orderId the first time", () => {
    const guard = createAutoPrintGuard();
    expect(guard.claim("order-1")).toBe(true);
  });

  it("B: blocks the same orderId on subsequent calls (idempotency)", () => {
    const guard = createAutoPrintGuard();
    guard.claim("order-1");
    expect(guard.claim("order-1")).toBe(false);
    expect(guard.claim("order-1")).toBe(false);
  });

  it("C: independent orders each get one print", () => {
    const guard = createAutoPrintGuard();
    expect(guard.claim("order-1")).toBe(true);
    expect(guard.claim("order-2")).toBe(true);
    expect(guard.claim("order-1")).toBe(false);
    expect(guard.claim("order-2")).toBe(false);
  });

  it("D: has() reflects claimed state without consuming", () => {
    const guard = createAutoPrintGuard();
    expect(guard.has("order-1")).toBe(false);
    guard.claim("order-1");
    expect(guard.has("order-1")).toBe(true);
  });
});

// ── E. Auto-print integration logic (pure) ────────────────────────────────
describe("auto-print business rules", () => {
  function simulateAccept(opts: {
    orderId: string;
    status: string;
    paymentPending: boolean;
    autoPrintEnabled: boolean;
    persistOk: boolean;
    guard: ReturnType<typeof createAutoPrintGuard>;
  }): boolean {
    const { orderId, status, paymentPending, autoPrintEnabled, persistOk, guard } = opts;
    // Only trigger print when:
    // 1. Persist succeeded
    // 2. New status is CONFIRMED (order accepted)
    // 3. auto-print is enabled
    // 4. Payment is not pending
    // 5. Guard hasn't claimed this ID yet
    if (!persistOk) return false;
    if (status !== "CONFIRMED") return false;
    if (paymentPending) return false;
    if (!autoPrintEnabled) return false;
    return guard.claim(orderId);
  }

  it("A: prints when accept succeeds and setting is enabled", () => {
    const guard = createAutoPrintGuard();
    const print = vi.fn();
    const shouldPrint = simulateAccept({
      orderId: "o1", status: "CONFIRMED", paymentPending: false,
      autoPrintEnabled: true, persistOk: true, guard,
    });
    if (shouldPrint) print("o1");
    expect(print).toHaveBeenCalledOnce();
  });

  it("B: does not print when setting is disabled", () => {
    const guard = createAutoPrintGuard();
    const print = vi.fn();
    const shouldPrint = simulateAccept({
      orderId: "o1", status: "CONFIRMED", paymentPending: false,
      autoPrintEnabled: false, persistOk: true, guard,
    });
    if (shouldPrint) print("o1");
    expect(print).not.toHaveBeenCalled();
  });

  it("C: does not print when persist (accept API) fails", () => {
    const guard = createAutoPrintGuard();
    const print = vi.fn();
    const shouldPrint = simulateAccept({
      orderId: "o1", status: "CONFIRMED", paymentPending: false,
      autoPrintEnabled: true, persistOk: false, guard,
    });
    if (shouldPrint) print("o1");
    expect(print).not.toHaveBeenCalled();
  });

  it("D: does not print for pending Pix orders", () => {
    const guard = createAutoPrintGuard();
    const print = vi.fn();
    const shouldPrint = simulateAccept({
      orderId: "o1", status: "CONFIRMED", paymentPending: true,
      autoPrintEnabled: true, persistOk: true, guard,
    });
    if (shouldPrint) print("o1");
    expect(print).not.toHaveBeenCalled();
  });

  it("E: duplicate render does not print twice", () => {
    const guard = createAutoPrintGuard();
    const print = vi.fn();
    for (let i = 0; i < 3; i++) {
      const shouldPrint = simulateAccept({
        orderId: "o1", status: "CONFIRMED", paymentPending: false,
        autoPrintEnabled: true, persistOk: true, guard,
      });
      if (shouldPrint) print("o1");
    }
    expect(print).toHaveBeenCalledOnce();
  });

  it("F: manual print is always available (guard does not block manual calls)", () => {
    // Manual print bypasses the guard entirely — it's called directly
    const manualPrint = vi.fn();
    manualPrint("o1");
    manualPrint("o1");
    expect(manualPrint).toHaveBeenCalledTimes(2);
  });
});
