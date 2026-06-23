import type { Progress } from "./types";
import { MODULES, getModule } from "./modules";
import { FLASHCARDS } from "./flashcards";
import { QUESTIONS } from "./questions";
import { todayKey } from "./storage";
import { isDue } from "./srs";
import { clamp } from "./util";

// ─────────────────────────────────────────────────────────────────────────────
// Gerador de plano diário + métricas de prontidão.
// Pensado para o cérebro com TDAH: UMA lista clara do que fazer HOJE, sem
// decisão, priorizando pontos fracos e capítulos críticos.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleMastery {
  moduleId: number;
  seen: number;
  correct: number;
  /** Acurácia 0..1 (0 se nunca visto). */
  acc: number;
  /** Domínio 0..1 combinando acurácia e cobertura. */
  mastery: number;
  critical: boolean;
}

export function moduleMastery(p: Progress): ModuleMastery[] {
  return MODULES.map((m) => {
    const st = p.moduleStats[m.id] ?? { seen: 0, correct: 0 };
    const acc = st.seen > 0 ? st.correct / st.seen : 0;
    const recommended = Math.max(5, m.examQuestions);
    const coverage = clamp(st.seen / recommended, 0, 1);
    const mastery = st.seen === 0 ? 0 : clamp(acc * (0.5 + 0.5 * coverage), 0, 1);
    return { moduleId: m.id, seen: st.seen, correct: st.correct, acc, mastery, critical: m.critical };
  });
}

/** Prontidão geral 0..100 (mistura domínio por módulo e melhor simulado). */
export function readiness(p: Progress): number {
  const mm = moduleMastery(p);
  let weighted = 0;
  let weightSum = 0;
  for (const m of MODULES) {
    const data = mm.find((x) => x.moduleId === m.id)!;
    weighted += data.mastery * m.examQuestions;
    weightSum += m.examQuestions;
  }
  const base = weightSum > 0 ? weighted / weightSum : 0;
  const bestExam = p.exams.reduce((mx, e) => Math.max(mx, e.scorePct), 0);
  const blended = p.exams.length > 0 ? 0.65 * base + 0.35 * bestExam : base;
  return Math.round(clamp(blended, 0, 1) * 100);
}

export interface ReviewCounts {
  due: number; // cards aprendidos cuja revisão venceu
  fresh: number; // cards ainda não vistos
  queue: number; // tamanho sugerido da fila de hoje
}

const DAILY_NEW_LIMIT = 15; // ritmo intensivo

export function reviewCounts(p: Progress, now = Date.now()): ReviewCounts {
  let due = 0;
  let fresh = 0;
  for (const f of FLASHCARDS) {
    const key = `f:${f.id}`;
    const st = p.srs[key];
    if (!st) fresh += 1;
    else if (isDue(st, now)) due += 1;
  }
  const queue = due + Math.min(fresh, DAILY_NEW_LIMIT);
  return { due, fresh, queue };
}

/** Módulos mais fracos (prioriza críticos e baixa acurácia / pouca cobertura). */
export function weakModules(p: Progress, limit = 3): number[] {
  const mm = moduleMastery(p);
  const scored = mm
    .map((m) => {
      // Quanto MENOR o score, mais urgente. Críticos ganham prioridade.
      const urgency = (1 - m.mastery) + (m.critical ? 0.25 : 0) + (m.seen === 0 ? 0.15 : 0);
      return { moduleId: m.moduleId, urgency };
    })
    .sort((a, b) => b.urgency - a.urgency);
  return scored.slice(0, limit).map((s) => s.moduleId);
}

export type TaskKind =
  | "flashcards"
  | "questions"
  | "simulado-mini"
  | "simulado-full"
  | "lesson";

export interface PlanTask {
  id: string;
  kind: TaskKind;
  title: string;
  subtitle: string;
  href: string;
  emoji: string;
  target: number;
  done: number;
  complete: boolean;
}

export interface DailyPlan {
  focusModuleId: number;
  weak: number[];
  reviews: ReviewCounts;
  tasks: PlanTask[];
  goalMinutes: number;
  minutesToday: number;
}

export function buildDailyPlan(p: Progress, now = Date.now()): DailyPlan {
  const today = todayKey(new Date(now));
  const activity = p.daily[today] ?? { minutes: 0, questions: 0, reviews: 0 };
  const reviews = reviewCounts(p, now);
  const weak = weakModules(p, 3);
  const focusModuleId = weak[0] ?? 1;
  const focus = getModule(focusModuleId);

  const tasks: PlanTask[] = [];

  // 1) Revisão por repetição espaçada (sempre primeiro — fixa o que já viu).
  if (reviews.queue > 0) {
    tasks.push({
      id: "review",
      kind: "flashcards",
      title: "Revisar flashcards",
      subtitle: `${reviews.queue} cards na fila de hoje${reviews.due ? ` (${reviews.due} vencendo)` : ""}`,
      href: "/ancord/estudar?modo=revisao",
      emoji: "🧠",
      target: reviews.queue,
      done: activity.reviews,
      complete: activity.reviews >= reviews.queue,
    });
  }

  // 2) Bateria de questões com foco no ponto mais fraco.
  const qTarget = 20;
  tasks.push({
    id: "questions",
    kind: "questions",
    title: "Responder questões",
    subtitle: focus ? `${qTarget} questões — foco em ${focus.short}` : `${qTarget} questões`,
    href: `/ancord/estudar?modo=questoes${focus ? `&modulo=${focus.id}` : ""}`,
    emoji: "⚡",
    target: qTarget,
    done: activity.questions,
    complete: activity.questions >= qTarget,
  });

  // 3) Revisar o resumo do módulo-foco (microlição rápida).
  if (focus) {
    tasks.push({
      id: "lesson",
      kind: "lesson",
      title: `Revisar resumo: ${focus.short}`,
      subtitle: "Leitura rápida de 3-5 min do capítulo prioritário",
      href: `/ancord/modulos/${focus.id}`,
      emoji: "📖",
      target: 1,
      done: 0,
      complete: false,
    });
  }

  // 4) Simulado — mini todo dia; completo a cada ~3 dias ou se nunca fez.
  const daysIn = Math.floor((now - p.createdAt) / (24 * 60 * 60 * 1000));
  const doFull = p.exams.length === 0 || daysIn % 3 === 0;
  if (doFull) {
    tasks.push({
      id: "sim-full",
      kind: "simulado-full",
      title: "Simulado completo (80 questões)",
      subtitle: "Cronômetro de 2h30 e regra real de aprovação",
      href: "/ancord/simulado?modo=full",
      emoji: "📝",
      target: 1,
      done: 0,
      complete: false,
    });
  } else {
    tasks.push({
      id: "sim-mini",
      kind: "simulado-mini",
      title: "Mini-simulado (20 questões)",
      subtitle: "Treino rápido cronometrado",
      href: "/ancord/simulado?modo=quick",
      emoji: "🎯",
      target: 1,
      done: 0,
      complete: false,
    });
  }

  return {
    focusModuleId,
    weak,
    reviews,
    tasks,
    goalMinutes: p.dailyGoalMinutes,
    minutesToday: activity.minutes,
  };
}

export const TOTAL_CARDS = FLASHCARDS.length;
export const TOTAL_QUESTIONS = QUESTIONS.length;
