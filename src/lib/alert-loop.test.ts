/**
 * AlertLoopController — repeat-until-action behavior (shared by the new-order and
 * human-attention alerts).
 *
 * Covers:
 *   C. repeats while an item requires action
 *   D. stops when the item is handled (and records the reason)
 *   E. duplicate renders do NOT create duplicate loops
 *   F. page unmount clears the loop
 *   + idempotent immediate play, max-duration cap, no audio overlap, repeat-off.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AlertLoopController, type AlertLoopDiagnostics } from "@/lib/alert-loop";

const INTERVAL = 10_000;

function makeController(opts?: {
  play?: (v: number) => Promise<void>;
  repeat?: boolean;
  volume?: number;
  maxDurationMs?: number;
}) {
  const play = opts?.play ?? vi.fn().mockResolvedValue(undefined);
  let diag: AlertLoopDiagnostics | null = null;
  const controller = new AlertLoopController({
    play,
    getVolume:       () => opts?.volume ?? 150,
    isRepeatEnabled: () => opts?.repeat ?? true,
    assetPath:       "/sounds/foocci-order-alert-custom.mp4",
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

  it("maxDurationMs 0 — never stops on time (rings until handled)", async () => {
    const { controller, play, getDiag } = makeController({ maxDurationMs: 0 });
    controller.sync(["o1"]);                          // immediate (1)
    // Well past the old 3-minute cap — the loop must keep firing.
    await vi.advanceTimersByTimeAsync(INTERVAL * 60);  // 10 min of repeats
    expect(play.mock.calls.length).toBeGreaterThan(30);
    expect(getDiag()?.loopActive).toBe(true);
    expect(getDiag()?.lastStopReason).not.toBe("MAX_DURATION");

    controller.resolve("o1", "ACCEPTED");             // only an explicit action stops it
    expect(getDiag()?.loopActive).toBe(false);
    expect(getDiag()?.lastStopReason).toBe("ACCEPTED");
    controller.dispose();
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
