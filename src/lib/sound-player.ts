/**
 * Shared alert sound player with volume boost.
 *
 * Volume is a percentage 0–200:
 *   ≤100 → HTMLAudioElement.volume (native, no Web Audio needed)
 *   >100 → Web Audio API GainNode (gain up to 2.0)
 *
 * Once an element is routed through an AudioContext it stays routed
 * (createMediaElementSource is irreversible), so subsequent plays at any
 * volume go through the gain node.
 */

export const MAX_VOLUME = 200;

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
