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

let armed = false;
const listeners = new Set<Listener>();

/** True once the page is allowed to play alert sounds (a gesture happened, or a play succeeded). */
export function isAudioArmed(): boolean {
  return armed;
}

/** Mark the page armed. Idempotent — subscribers fire only on the false→true edge. */
export function markAudioArmed(): void {
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
  listeners.clear();
}
