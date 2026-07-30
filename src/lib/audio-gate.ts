/**
 * Audio arming gate — a tiny, framework-agnostic source of truth for ONE fact:
 * has the browser's autoplay lock been lifted for THIS document yet?
 *
 * Browsers refuse to play any sound until the user interacts with the page once.
 * That single gesture is the whole ballgame for order alerts. This module lets
 * the sound engine (which flips it armed on a real gesture or a successful play)
 * and the on-screen "ativar som" prompt stay in sync — no prop-drilling, no
 * context, no React. DOM/React-free on purpose so it unit-tests with no shims.
 */

type Listener = () => void;

const STORAGE_KEY = "foocci:audio-opted-in";

let armed = false;
// Hydrated lazily from localStorage on first read; null = not checked yet.
let optedIn: boolean | null = null;
const listeners = new Set<Listener>();

function readOptedIn(): boolean {
  if (optedIn !== null) return optedIn;
  if (typeof window === "undefined") return (optedIn = false);
  try {
    optedIn = window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    optedIn = false;
  }
  return optedIn;
}

function persistOptedIn(): void {
  optedIn = true;
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* storage unavailable */ }
}

/** True once the page is allowed to play alert sounds (a gesture happened, or a play succeeded). */
export function isAudioArmed(): boolean {
  return armed;
}

/**
 * True once the user has EVER explicitly enabled alert sound on this browser
 * (persisted in localStorage). Lets the TopBar chip stop nagging after the first
 * opt-in — the owner "aperta uma vez e fica configurado" — even across reloads,
 * while the real autoplay unlock (isAudioArmed) still needs one gesture per load.
 */
export function isAudioOptedIn(): boolean {
  return readOptedIn();
}

/** Mark the page armed. Idempotent — subscribers fire only on the false→true edge. */
export function markAudioArmed(): void {
  persistOptedIn(); // remember the choice across reloads, even if already armed
  if (armed) return;
  armed = true;
  for (const l of [...listeners]) {
    try { l(); } catch { /* one bad subscriber must not break the rest */ }
  }
}

/** Subscribe to arming changes. Returns an unsubscribe fn. */
export function subscribeAudioArmed(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Test-only: reset module state between cases. */
export function __resetAudioGate(): void {
  armed = false;
  optedIn = null;
  listeners.clear();
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}
