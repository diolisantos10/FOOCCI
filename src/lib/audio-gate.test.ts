/**
 * Audio arming gate — the single source of truth for "is the browser's autoplay
 * lock lifted yet?". The "ativar som" bar and the alert engine both read it, so
 * its edge semantics (fire once on false→true, never re-fire, clean unsubscribe)
 * are what keep the prompt from flickering or getting stuck on screen.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  isAudioArmed,
  markAudioArmed,
  subscribeAudioArmed,
  __resetAudioGate,
} from "@/lib/audio-gate";

beforeEach(() => __resetAudioGate());

describe("audio-gate", () => {
  it("starts disarmed", () => {
    expect(isAudioArmed()).toBe(false);
  });

  it("markAudioArmed flips to armed and notifies subscribers once", () => {
    let calls = 0;
    subscribeAudioArmed(() => { calls++; });
    markAudioArmed();
    expect(isAudioArmed()).toBe(true);
    expect(calls).toBe(1);
  });

  it("is idempotent — a second arm neither re-fires nor un-arms", () => {
    let calls = 0;
    subscribeAudioArmed(() => { calls++; });
    markAudioArmed();
    markAudioArmed();
    markAudioArmed();
    expect(isAudioArmed()).toBe(true);
    expect(calls).toBe(1); // only the false→true edge notifies
  });

  it("notifies every live subscriber on the arming edge", () => {
    const seen: string[] = [];
    subscribeAudioArmed(() => seen.push("a"));
    subscribeAudioArmed(() => seen.push("b"));
    markAudioArmed();
    expect(seen.sort()).toEqual(["a", "b"]);
  });

  it("stops notifying after unsubscribe", () => {
    let calls = 0;
    const off = subscribeAudioArmed(() => { calls++; });
    off();
    markAudioArmed();
    expect(calls).toBe(0);
  });

  it("a throwing subscriber does not block the others", () => {
    const seen: string[] = [];
    subscribeAudioArmed(() => { throw new Error("boom"); });
    subscribeAudioArmed(() => seen.push("survived"));
    expect(() => markAudioArmed()).not.toThrow();
    expect(seen).toEqual(["survived"]);
  });

  it("a subscriber added AFTER arming is not retroactively fired", () => {
    markAudioArmed();
    let calls = 0;
    subscribeAudioArmed(() => { calls++; });
    expect(calls).toBe(0);
    expect(isAudioArmed()).toBe(true);
  });
});
