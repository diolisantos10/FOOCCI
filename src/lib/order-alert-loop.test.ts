/**
 * OrderAlertController — repeat-until-action behavior for the NEW ORDER alert.
 *
 * Covers the P0 requirements:
 *   C. repeats while an order requires action
 *   D. stops when the order is accepted (and records the reason)
 *   E. duplicate renders do NOT create duplicate loops
 *   F. page unmount clears the loop
 *   + idempotent immediate play, max-duration cap, no audio overlap, repeat-off.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OrderAlertController, type OrderAlertDiagnostics } from "@/lib/order-alert-loop";

const INTERVAL = 10_000;

function makeController(opts?: {
  play?: (v: number) => Promise<void>;
  repeat?: boolean;
  volume?: number;
  maxDurationMs?: number;
}) {
  const play = opts?.play ?? vi.fn().mockResolvedValue(undefined);
  let diag: OrderAlertDiagnostics | null = null;
  const controller = new OrderAlertController({
    play,
    getVolume:       () => opts?.volume ?? 150,
    isRepeatEnabled: () => opts?.repeat ?? true,
    assetPath:       "/sounds/foocci-order-alert-loud.wav",
    intervalMs:      INTERVAL,
    maxDurationMs:   opts?.maxDurationMs ?? 180_000,
    onDiagnostics:   (d) => { diag = d; },
  });
  return { controller, play, getDiag: () => diag };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("OrderAlertController", () => {
  it("C — plays immediately and repeats every interval while an order needs action", async () => {
    const { controller, play } = makeController();
    controller.sync(["o1"]);
    expect(play).toHaveBeenCalledTimes(1);          // immediate

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(play).toHaveBeenCalledTimes(2);          // first repeat

    await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    expect(play).toHaveBeenCalledTimes(4);          // keeps repeating
    controller.dispose();
  });

  it("D — stops and records ACCEPTED when the order is accepted", async () => {
    const { controller, play, getDiag } = makeController();
    controller.sync(["o1"]);
    expect(play).toHaveBeenCalledTimes(1);

    controller.resolve("o1", "ACCEPTED");
    // A follow-up empty sync (React re-render) must not clobber the reason.
    controller.sync([]);

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(play).toHaveBeenCalledTimes(1);          // no more plays after accept
    expect(getDiag()?.loopActive).toBe(false);
    expect(getDiag()?.lastStopReason).toBe("ACCEPTED");
  });

  it("D2 — stops with REJECTED / SEEN reasons", async () => {
    const a = makeController();
    a.controller.sync(["o1"]);
    a.controller.resolve("o1", "REJECTED");
    expect(a.getDiag()?.lastStopReason).toBe("REJECTED");

    const b = makeController();
    b.controller.sync(["o2"]);
    b.controller.sync([]);                           // disappeared without explicit resolve
    expect(b.getDiag()?.lastStopReason).toBe("SEEN");
  });

  it("E — duplicate renders do not start duplicate loops or double the immediate play", async () => {
    const { controller, play } = makeController();
    controller.sync(["o1"]);
    controller.sync(["o1"]);
    controller.sync(["o1"]);
    expect(play).toHaveBeenCalledTimes(1);          // idempotent immediate play

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(play).toHaveBeenCalledTimes(2);          // exactly ONE loop, one repeat
    controller.dispose();
  });

  it("E2 — a second new order shares the single loop (no chaotic overlap)", async () => {
    const { controller, play } = makeController();
    controller.sync(["o1"]);                         // +1 immediate
    await vi.advanceTimersByTimeAsync(0);            // let the first play settle (next render)
    controller.sync(["o1", "o2"]);                   // o2 new → +1 immediate
    expect(play).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(play).toHaveBeenCalledTimes(3);           // still ONE shared loop → +1 (not +2)
    controller.dispose();
  });

  it("E3 — overlapping immediate plays are coalesced into one (no double-beep)", async () => {
    // Two new orders observed in the SAME synchronous tick (before the first
    // play resolves) must not stack a second sound on top of the first.
    const play = vi.fn(() => new Promise<void>(() => { /* in flight */ }));
    const { controller } = makeController({ play });
    controller.sync(["o1"]);
    controller.sync(["o1", "o2"]);
    expect(play).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("F — dispose clears the loop and records PAGE_UNMOUNT", async () => {
    const { controller, play, getDiag } = makeController();
    controller.sync(["o1"]);
    expect(play).toHaveBeenCalledTimes(1);

    controller.dispose();
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(play).toHaveBeenCalledTimes(1);           // no plays after unmount
    expect(getDiag()?.loopActive).toBe(false);
    expect(getDiag()?.lastStopReason).toBe("PAGE_UNMOUNT");
  });

  it("caps the loop at maxDuration (MAX_DURATION)", async () => {
    const { controller, play, getDiag } = makeController({ maxDurationMs: 25_000 });
    controller.sync(["o1"]);                         // t=0 immediate (1)
    await vi.advanceTimersByTimeAsync(INTERVAL);      // t=10s → play (2)
    await vi.advanceTimersByTimeAsync(INTERVAL);      // t=20s → play (3)
    await vi.advanceTimersByTimeAsync(INTERVAL);      // t=30s ≥ 25s cap → stop, no play
    expect(play).toHaveBeenCalledTimes(3);
    expect(getDiag()?.lastStopReason).toBe("MAX_DURATION");

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(play).toHaveBeenCalledTimes(3);           // stays stopped
  });

  it("does not overlap audio while a previous play is still in flight", async () => {
    const play = vi.fn(() => new Promise<void>(() => { /* never resolves */ }));
    const { controller } = makeController({ play });
    controller.sync(["o1"]);                          // 1 in-flight, never resolves
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(play).toHaveBeenCalledTimes(1);            // ticks skipped while in flight
    controller.dispose();
  });

  it("repeat disabled — plays once immediately and never loops", async () => {
    const { controller, play, getDiag } = makeController({ repeat: false });
    controller.sync(["o1"]);
    expect(play).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(play).toHaveBeenCalledTimes(1);            // no repeats
    expect(getDiag()?.loopActive).toBe(false);
    controller.dispose();
  });

  it("passes the effective (theme-adjusted) volume to the player", () => {
    const { controller, play } = makeController({ volume: 300 });
    controller.sync(["o1"]);
    expect(play).toHaveBeenCalledWith(300);
    controller.dispose();
  });
});
