import type { Question, ExamResult } from "./types";
import { QUESTIONS, questionsByModule } from "./questions";
import {
  MODULES,
  TOTAL_EXAM_QUESTIONS,
  PASS_PCT,
  CRITICAL_MIN_PCT,
} from "./modules";
import { shuffle, optionOrder } from "./util";

// ─────────────────────────────────────────────────────────────────────────────
// Montagem e correção do simulado.
//
// O simulado completo replica a prova: 80 questões distribuídas pelo peso de
// cada módulo, alternativas embaralhadas, e a regra de aprovação real
// (≥70% no geral E ≥50% em cada capítulo crítico).
// ─────────────────────────────────────────────────────────────────────────────

export interface ExamItem {
  q: Question;
  /** Permutação das alternativas: displayIndex -> índice original. */
  order: number[];
}

/** Alternativas já embaralhadas para exibição + índice correto exibido. */
export function displayOptions(item: ExamItem): { options: string[]; correct: number } {
  const options = item.order.map((i) => item.q.options[i]!);
  const correct = item.order.indexOf(item.q.correct);
  return { options, correct };
}

function fillModule(moduleId: number, target: number): Question[] {
  const pool = shuffle(questionsByModule(moduleId));
  if (pool.length === 0) return [];
  const out: Question[] = [];
  let i = 0;
  while (out.length < target) {
    out.push(pool[i % pool.length]!); // cicla: únicas primeiro, repete só se faltar
    i++;
  }
  return out;
}

/** Distribui `count` questões pelos módulos conforme o blueprint da prova. */
function blueprint(count: number): Record<number, number> {
  const scaled: Record<number, number> = {};
  let sum = 0;
  for (const m of MODULES) {
    const n = Math.round((m.examQuestions / TOTAL_EXAM_QUESTIONS) * count);
    scaled[m.id] = n;
    sum += n;
  }
  // Ajuste fino para bater exatamente em `count`.
  let diff = count - sum;
  const order = [...MODULES].sort((a, b) => b.examQuestions - a.examQuestions);
  let idx = 0;
  while (diff !== 0 && order.length > 0) {
    const m = order[idx % order.length]!;
    const next = (scaled[m.id] ?? 0) + (diff > 0 ? 1 : -1);
    if (next >= 0) {
      scaled[m.id] = next;
      diff += diff > 0 ? -1 : 1;
    }
    idx++;
  }
  return scaled;
}

export type ExamMode = "full" | "quick" | "module";

/** Monta um simulado. `full` = 80q; `quick` = 20q; `module` = só o módulo. */
export function buildExam(opts: {
  mode: ExamMode;
  moduleId?: number;
  count?: number;
}): ExamItem[] {
  let questions: Question[] = [];

  if (opts.mode === "module" && opts.moduleId != null) {
    const n = opts.count ?? questionsByModule(opts.moduleId).length;
    questions = fillModule(opts.moduleId, n);
  } else {
    const count = opts.mode === "full" ? TOTAL_EXAM_QUESTIONS : opts.count ?? 20;
    const dist = blueprint(count);
    for (const m of MODULES) {
      const target = dist[m.id] ?? 0;
      questions.push(...fillModule(m.id, target));
    }
  }

  return shuffle(questions).map((q) => ({ q, order: optionOrder() }));
}

export interface ScoreInput {
  items: ExamItem[];
  /** Índice exibido escolhido em cada item (null = em branco). */
  answers: (number | null)[];
  durationSec: number;
}

export function scoreExam({ items, answers, durationSec }: ScoreInput): ExamResult {
  const perModule: Record<number, { total: number; correct: number }> = {};
  let correct = 0;

  items.forEach((item, idx) => {
    const mod = item.q.moduleId;
    perModule[mod] ??= { total: 0, correct: 0 };
    perModule[mod]!.total += 1;
    const chosen = answers[idx];
    const correctDisplay = item.order.indexOf(item.q.correct);
    if (chosen != null && chosen === correctDisplay) {
      correct += 1;
      perModule[mod]!.correct += 1;
    }
  });

  const total = items.length;
  const scorePct = total > 0 ? correct / total : 0;

  // Regra real: ≥70% no geral E ≥50% em cada capítulo crítico presente.
  const criticalsOk = MODULES.filter((m) => m.critical).every((m) => {
    const pm = perModule[m.id];
    if (!pm || pm.total === 0) return true; // módulo ausente do recorte não reprova
    return pm.correct / pm.total >= CRITICAL_MIN_PCT;
  });

  const passed = scorePct >= PASS_PCT && criticalsOk;

  return {
    ts: Date.now(),
    total,
    correct,
    scorePct,
    passed,
    perModule,
    durationSec,
  };
}

export const BANK_SIZE = QUESTIONS.length;
