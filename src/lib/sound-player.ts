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
    const ctx = new Ctor();
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
 * Installs a one-time pointerdown listener on window that silently unlocks
 * browser autoplay policy without any visible UI.
 *
 * On the first user interaction:
 *  1. Resumes (or creates) an AudioContext to satisfy Web Audio autoplay rules.
 *  2. Plays each provided audio element at volume 0 then immediately pauses,
 *     which satisfies the HTMLMediaElement autoplay policy in browsers that
 *     require a user gesture before play() resolves.
 *
 * After the first interaction the listener removes itself — it runs at most once.
 * Failures are silently swallowed; the operational code already handles the case
 * where play() rejects (falls back to beep or logs internally).
 */
export function installSilentUnlock(getAudioElements: () => HTMLAudioElement[]): void {
  if (typeof window === "undefined") return;

  let done = false;

  const handler = () => {
    if (done) return;
    done = true;
    window.removeEventListener("pointerdown", handler, { capture: true });

    const Ctor = getAudioContextCtor();
    if (Ctor) {
      try {
        // Re-use a shared context if one was already wired, otherwise create one
        const ctx = new Ctor();
        if (ctx.state === "suspended") {
          void ctx.resume().catch(() => {});
        }
        // Play a 1-sample silent buffer — resolves immediately
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
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
  };

  window.addEventListener("pointerdown", handler, { capture: true, once: true });
}
