import { describe, it, expect, vi, afterEach } from "vitest";
import { startSoundLeaderElection } from "./sound-leader";

const realNavigator = (globalThis as { navigator?: unknown }).navigator;
function setNavigator(n: unknown) {
  Object.defineProperty(globalThis, "navigator", { value: n, configurable: true, writable: true });
}
afterEach(() => setNavigator(realNavigator));

describe("startSoundLeaderElection", () => {
  it("sem Web Locks → supported=false e nunca é líder", () => {
    setNavigator({}); // sem .locks
    const l = startSoundLeaderElection(() => {});
    expect(l.supported).toBe(false);
    expect(l.isLeader()).toBe(false);
    l.dispose(); // não pode lançar
  });

  it("com Web Locks → vira líder ao receber o lock e libera no dispose", () => {
    let held: Promise<void> | null = null;
    setNavigator({
      locks: {
        request: (_name: string, _opts: unknown, cb: () => Promise<void>) => {
          held = cb(); // simula lock concedido → roda a callback (executor síncrono)
          return held.then(() => undefined);
        },
      },
    });
    const onLeader = vi.fn();
    const l = startSoundLeaderElection(onLeader);

    expect(l.supported).toBe(true);
    expect(l.isLeader()).toBe(true); // executor do new Promise roda sincronamente
    expect(onLeader).toHaveBeenCalledTimes(1);

    let released = false;
    void held!.then(() => { released = true; });
    l.dispose();
    expect(l.isLeader()).toBe(false);
    return Promise.resolve().then(() => expect(released).toBe(true));
  });
});
