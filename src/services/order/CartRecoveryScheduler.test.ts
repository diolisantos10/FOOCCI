import { describe, it, expect } from "vitest";
import { CartRecoveryScheduler } from "./CartRecoveryScheduler";

/**
 * DB-free contract test for the scheduler's in-memory diagnostics snapshot.
 * The snapshot is what the cart-recovery-qa / recovery-scheduler diagnostics
 * surface to operators, so its shape and safe defaults must stay stable.
 */
describe("CartRecoveryScheduler.getState — diagnostics snapshot", () => {
  it("exposes a stable, fully-populated shape before any tick", () => {
    const state = CartRecoveryScheduler.getState();

    // Identity / configuration fields are always present.
    expect(state.tickIntervalMs).toBe(60_000);
    expect(state.inactivityMinutes).toBe(2);
    expect(typeof state.started).toBe("boolean");

    // Activity counters start clean and never undefined.
    expect(state.tickCount).toBe(0);
    expect(state.lastTickAt).toBeNull();
    expect(state.lastTickResult).toBeNull();
    expect(state.lastTickError).toBeNull();
  });

  it("does not start the scheduler merely by reading state", () => {
    // getState() is read-only — calling it must never arm the interval.
    const before = CartRecoveryScheduler.getState().started;
    CartRecoveryScheduler.getState();
    expect(CartRecoveryScheduler.getState().started).toBe(before);
  });

  it("start() is a no-op outside production (no accidental sends in tests)", () => {
    // NODE_ENV is "test" under vitest, so start() must refuse to arm the interval.
    CartRecoveryScheduler.start();
    expect(CartRecoveryScheduler.getState().started).toBe(false);
  });
});
