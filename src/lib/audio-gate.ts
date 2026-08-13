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
/**
 * Um alerta REAL tentou tocar e o navegador recusou (autoplay). Isto não é
 * "configuração", é evidência: só fica true depois de um pedido de verdade ter
 * entrado mudo. É o único fato que autoriza a tela a pedir um toque ao lojista.
 */
let blocked = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of [...listeners]) {
    try { l(); } catch { /* one bad subscriber must not break the rest */ }
  }
}

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
  blocked = false;  // armado é o oposto de bloqueado: o aviso some junto
  if (armed) return;
  armed = true;
  notify();
}

/**
 * True enquanto um alerta real estiver sem conseguir tocar neste carregamento.
 *
 * POR QUE ISTO EXISTE (13/08/2026) — o chip "Som ativo" da barra superior foi
 * removido por ordem do CEO, e ele mentia: dizia "ativo" com base numa marca de
 * localStorage de algum dia no passado, enquanto o navegador exige um toque a
 * CADA carregamento. O dono lia "Som ativo" e o pedido entrava mudo.
 *
 * O que ficou no lugar não é status: é alarme com evidência. Só aparece quando
 * um pedido de verdade já tentou tocar e o navegador recusou.
 */
export function isAudioBlocked(): boolean {
  return blocked;
}

/** Registra que um alerta real foi recusado pelo navegador. Idempotente. */
export function markAudioBlocked(): void {
  if (blocked || armed) return;
  blocked = true;
  notify();
}

/** Limpa o alarme (tocou, ou não há mais nada esperando). Idempotente. */
export function clearAudioBlocked(): void {
  if (!blocked) return;
  blocked = false;
  notify();
}

/**
 * Traduz a tentativa de um alerta REAL no estado do aviso da barra superior.
 *
 * Só um motivo autoriza o aviso: o navegador recusou tocar (política de
 * autoplay) **enquanto havia item esperando**. Erro de rede, arquivo faltando ou
 * alarme sem item não valem — aviso sem evidência é ruído que ninguém investiga.
 *
 * `limpaAoEsvaziar` é do alarme de PEDIDO: se não há mais pedido esperando, não
 * há mais o que avisar. O alarme de atendimento não apaga o aviso ao esvaziar,
 * porque o silêncio dele não prova nada sobre o pedido que entrou mudo.
 */
export function refletirTentativaDeAlerta(
  d: { lastResult: "success" | "error" | null; lastError: string | null; activeCount: number },
  limpaAoEsvaziar = false,
): void {
  const recusado = /notallowed|not allowed|suspended|gesture/i.test(d.lastError ?? "");
  if (d.lastResult === "error" && d.activeCount > 0 && recusado) {
    markAudioBlocked();
  } else if (d.lastResult === "success" || (limpaAoEsvaziar && d.activeCount === 0)) {
    clearAudioBlocked();
  }
}

/** Subscribe to gate changes (arming and the blocked alarm). Returns an unsubscribe fn. */
export function subscribeAudioArmed(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Test-only: reset module state between cases. */
export function __resetAudioGate(): void {
  armed = false;
  optedIn = null;
  blocked = false;
  listeners.clear();
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}
