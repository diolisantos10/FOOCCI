import type { SrsState } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Repetição espaçada — SM-2 simplificado.
//
// Nota (qualidade da resposta):
//   0 = Errei      (volta logo, ainda nesta sessão)
//   1 = Difícil
//   2 = Bom
//   3 = Fácil
//
// O intervalo cresce conforme você acerta com facilidade, e encolhe quando erra
// — o card reaparece "bem na hora em que você ia esquecer".
// ─────────────────────────────────────────────────────────────────────────────

export type Grade = 0 | 1 | 2 | 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const AGAIN_DELAY_MS = 8 * 60 * 1000; // 8 min — reaparece na mesma sessão

export function newCard(id: string, now = Date.now()): SrsState {
  return { id, ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, lastSeen: 0 };
}

export function review(state: SrsState, grade: Grade, now = Date.now()): SrsState {
  let { ease, interval, reps, lapses } = state;

  if (grade === 0) {
    // Errou: reinicia o ciclo e volta ainda nesta sessão.
    reps = 0;
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    return { ...state, ease, interval: 0, reps, lapses, due: now + AGAIN_DELAY_MS, lastSeen: now };
  }

  reps += 1;

  if (grade === 1) ease = Math.max(MIN_EASE, ease - 0.15); // difícil
  else if (grade === 3) ease = ease + 0.15; // fácil

  if (reps === 1) interval = grade === 3 ? 2 : 1;
  else if (reps === 2) interval = grade === 1 ? 2 : 3;
  else interval = Math.max(1, Math.round(interval * ease));

  if (grade === 1) interval = Math.max(1, Math.round(interval * 0.6)); // difícil encurta

  return { ...state, ease, interval, reps, lapses, due: now + interval * DAY_MS, lastSeen: now };
}

export function isDue(state: SrsState | undefined, now = Date.now()): boolean {
  if (!state) return true; // card nunca visto = disponível
  return state.due <= now;
}

/** Converte acerto/erro de uma questão objetiva em nota SRS. */
export function gradeFromAnswer(correct: boolean, fast: boolean): Grade {
  if (!correct) return 0;
  return fast ? 3 : 2;
}
