/**
 * Shared alert sound player with volume boost.
 *
 * Volume is a percentage 0–400:
 *   ≤100 → HTMLAudioElement.volume (native, no Web Audio needed)
 *   >100 → Web Audio API GainNode (gain up to 4.0)
 *
 * The 400% ceiling exists so a noisy restaurant kitchen can drive the alert
 * well past unity. Gains above ~1/peak intentionally soft-clip the (already
 * normalized) asset — for an alert that extra harshness aids audibility.
 *
 * Once an element is routed through an AudioContext it stays routed
 * (createMediaElementSource is irreversible), so subsequent plays at any
 * volume go through the gain node.
 */

import { markAudioArmed } from "./audio-gate";

export const MAX_VOLUME = 400;

/** Per-theme loudness multipliers applied on top of the saved volume. */
const THEME_GAIN: Record<string, number> = {
  DEFAULT: 1.0,
  SOFT:    0.6,
  URGENT:  1.5,
};

/**
 * Effective alert volume % after applying the sound theme, clamped to MAX_VOLUME.
 * URGENT pushes the new-order alert louder; SOFT pulls it back.
 */
export function effectiveAlertVolume(volumePercent: number, theme: string): number {
  const factor = THEME_GAIN[theme] ?? 1.0;
  return clampVolume(volumePercent * factor);
}

const wired = new WeakMap<HTMLAudioElement, { ctx: AudioContext; gain: GainNode }>();

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

/** True when the browser supports volume above 100% (Web Audio API). */
export function supportsVolumeBoost(): boolean {
  return getAudioContextCtor() !== null;
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 100;
  return Math.max(0, Math.min(MAX_VOLUME, Math.round(v)));
}

// ── Shared, long-lived AudioContext ──────────────────────────────────────────
// ONE context for the whole tab, reused by every play AND by the arming path.
// Unlocking it once (on any user gesture) keeps every later alert audible — even
// after the tab has sat in the background all day, because we resume() it the
// instant the tab comes back to the foreground. The old code spun up a throwaway
// context per element, so the gesture that unlocked one never helped the next.
let sharedCtx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  if (!sharedCtx) {
    try { sharedCtx = new Ctor(); } catch { sharedCtx = null; }
  }
  return sharedCtx;
}

/** Resume the shared context if the browser suspended it (e.g. tab was backgrounded). */
export async function resumeSharedAudioContext(): Promise<void> {
  const ctx = sharedCtx;
  if (ctx && ctx.state === "suspended") {
    try { await ctx.resume(); } catch { /* needs a gesture — the arming path covers it */ }
  }
}

/**
 * Play an alert at the given volume percentage (0–200).
 * Rejects with DOMException "NotAllowedError" when the browser blocks
 * playback (autoplay policy) — same contract as audio.play().
 */
export async function playAlertAudio(audio: HTMLAudioElement, volumePercent: number): Promise<void> {
  const v = clampVolume(volumePercent) / 100;
  audio.pause();
  audio.currentTime = 0;

  const existing = wired.get(audio);

  // Plain path: no boost requested and element not yet captured by Web Audio
  if (v <= 1 && !existing) {
    audio.volume = v;
    await audio.play();
    return;
  }

  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    // Boost requested but Web Audio unavailable — cap at 100%
    audio.volume = Math.min(1, v);
    await audio.play();
    return;
  }

  let wiring = existing;
  if (!wiring) {
    const ctx = getSharedAudioContext();
    if (!ctx) { audio.volume = Math.min(1, v); await audio.play(); return; }
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    wiring = { ctx, gain };
    wired.set(audio, wiring);
  }

  if (wiring.ctx.state === "suspended") {
    await wiring.ctx.resume().catch(() => { /* checked below */ });
    if (wiring.ctx.state === "suspended") {
      // Context can't start without a user gesture — element output is captured
      // by the context, so playback would be silent. Surface as autoplay block.
      throw new DOMException("AudioContext suspended — user gesture required", "NotAllowedError");
    }
  }

  audio.volume = 1;
  wiring.gain.gain.value = v;
  await audio.play();
}

/**
 * Arms audio for the whole tab, from inside a user gesture:
 *  1. Resumes the shared AudioContext (Web Audio autoplay rule).
 *  2. Plays each provided element at volume 0 then pauses — lifts the
 *     HTMLMediaElement autoplay lock so later real plays resolve.
 *  3. Flips the arming gate so the "ativar som" prompt disappears.
 *
 * MUST run inside a gesture (click / key / touch) — the browser's hard rule.
 * We don't fight it; we just make the gesture be ANY natural interaction.
 * Safe to call repeatedly; failures are swallowed (the loop handles a reject).
 */
export function armAlertAudio(getAudioElements: () => HTMLAudioElement[], onArmed?: () => void): void {
  const Ctor = getAudioContextCtor();
  if (Ctor) {
    try {
      const ctx = getSharedAudioContext();
      if (ctx) {
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        // A 1-sample silent buffer resolves immediately and warms the context.
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch { /* ignore */ }
  }

  for (const audio of getAudioElements()) {
    try {
      const saved = audio.volume;
      audio.volume = 0;
      void audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = saved;
      }).catch(() => { audio.volume = saved; });
    } catch { /* ignore */ }
  }

  markAudioArmed();
  onArmed?.();
}

/**
 * Installs capture-phase listeners so the FIRST natural interaction anywhere in
 * the app — a click, a key, or a tap — arms audio (see armAlertAudio). This is
 * the fix for "the sound only works after I go press Testar": the old hook armed
 * only on `pointerdown`, so a keyboard user (or someone who never clicked INSIDE
 * Foocci before the first order) stayed muted. Runs the arm at most once, then
 * removes every listener. Returns a cleanup fn.
 */
export function installGlobalAudioArming(
  getAudioElements: () => HTMLAudioElement[],
  onArmed?: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const EVENTS: (keyof WindowEventMap)[] = ["pointerdown", "mousedown", "touchstart", "keydown", "click"];
  let done = false;

  const handler = () => {
    if (done) return;
    done = true;
    for (const ev of EVENTS) window.removeEventListener(ev, handler, { capture: true });
    armAlertAudio(getAudioElements, onArmed);
  };

  for (const ev of EVENTS) window.addEventListener(ev, handler, { capture: true, passive: true });
  return () => {
    for (const ev of EVENTS) window.removeEventListener(ev, handler, { capture: true });
  };
}
