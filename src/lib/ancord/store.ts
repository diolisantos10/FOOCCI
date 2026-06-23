"use client";

import { useSyncExternalStore } from "react";
import type { Progress, Question, ExamResult, DailyActivity } from "./types";
import {
  loadProgress,
  saveProgress,
  defaultProgress,
  todayKey,
  diffInDays,
} from "./storage";
import { newCard, review, gradeFromAnswer, type Grade } from "./srs";

// ─────────────────────────────────────────────────────────────────────────────
// Store reativo do treinador ANCORD (client-side, localStorage).
// Usa useSyncExternalStore — sem libs externas. Toda mutação é imutável.
// ─────────────────────────────────────────────────────────────────────────────

let state: Progress | null = null;
const serverSnapshot: Progress = defaultProgress();
const listeners = new Set<() => void>();

function getState(): Progress {
  if (state === null) state = loadProgress();
  return state;
}
function getServerState(): Progress {
  return serverSnapshot;
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function commit(next: Progress): void {
  state = next;
  saveProgress(next);
  listeners.forEach((l) => l());
}
function update(mut: (p: Progress) => Progress): void {
  commit(mut(getState()));
}

// ── helpers internos ─────────────────────────────────────────────────────────

function withDailyAndStreak(p: Progress, patch: Partial<DailyActivity>): Progress {
  const today = todayKey();
  const prev = p.daily[today] ?? { minutes: 0, questions: 0, reviews: 0 };
  const daily = {
    ...p.daily,
    [today]: {
      minutes: prev.minutes + (patch.minutes ?? 0),
      questions: prev.questions + (patch.questions ?? 0),
      reviews: prev.reviews + (patch.reviews ?? 0),
    },
  };

  let streak = p.streak;
  if (streak.lastStudyDay !== today) {
    const consecutive =
      streak.lastStudyDay != null && diffInDays(today, streak.lastStudyDay) === 1;
    const current = consecutive ? streak.current + 1 : 1;
    streak = { current, best: Math.max(current, streak.best), lastStudyDay: today };
  }
  return { ...p, daily, streak };
}

// ── ações de domínio ─────────────────────────────────────────────────────────

export function recordAnswer(q: Question, correct: boolean, fast: boolean): void {
  update((p) => {
    const key = `q:${q.id}`;
    const srs = {
      ...p.srs,
      [key]: review(p.srs[key] ?? newCard(key), gradeFromAnswer(correct, fast)),
    };
    const st = p.moduleStats[q.moduleId] ?? { seen: 0, correct: 0 };
    const moduleStats = {
      ...p.moduleStats,
      [q.moduleId]: { seen: st.seen + 1, correct: st.correct + (correct ? 1 : 0) },
    };
    const attempts = [
      ...p.attempts,
      { qid: q.id, moduleId: q.moduleId, correct, ts: Date.now() },
    ].slice(-300);
    const xp = p.xp + (correct ? 10 : 2);
    return withDailyAndStreak({ ...p, srs, moduleStats, attempts, xp }, { questions: 1 });
  });
}

export function reviewFlashcard(cardId: string, grade: Grade): void {
  update((p) => {
    const key = `f:${cardId}`;
    const srs = { ...p.srs, [key]: review(p.srs[key] ?? newCard(key), grade) };
    const xp = p.xp + (grade === 0 ? 1 : 3);
    return withDailyAndStreak({ ...p, srs, xp }, { reviews: 1 });
  });
}

export function addStudyMinutes(minutes: number): void {
  if (minutes <= 0) return;
  update((p) => withDailyAndStreak(p, { minutes }));
}

export function recordExam(result: ExamResult): void {
  update((p) => {
    const exams = [...p.exams, result].slice(-30);
    const moduleStats = { ...p.moduleStats };
    for (const [mid, pm] of Object.entries(result.perModule)) {
      const id = Number(mid);
      const st = moduleStats[id] ?? { seen: 0, correct: 0 };
      moduleStats[id] = { seen: st.seen + pm.total, correct: st.correct + pm.correct };
    }
    const xp = p.xp + 50 + result.correct * 2;
    return withDailyAndStreak({ ...p, exams, moduleStats, xp }, { questions: result.total });
  });
}

export function setExamDate(iso: string | null): void {
  update((p) => ({ ...p, examDate: iso }));
}

export function setDailyGoal(minutes: number): void {
  update((p) => ({ ...p, dailyGoalMinutes: minutes }));
}

export function completeOnboarding(examDate: string | null, goalMinutes: number): void {
  update((p) => ({ ...p, onboarded: true, examDate, dailyGoalMinutes: goalMinutes }));
}

export function resetAll(): void {
  commit(defaultProgress());
}

export function exportJSON(): string {
  return JSON.stringify(getState(), null, 2);
}

export function importJSON(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (typeof parsed !== "object" || parsed === null) return false;
    commit({ ...defaultProgress(), ...parsed, version: 1 });
    return true;
  } catch {
    return false;
  }
}

// ── hooks ────────────────────────────────────────────────────────────────────

export function useAncord(): Progress {
  return useSyncExternalStore(subscribe, getState, getServerState);
}

/** true depois da hidratação no cliente (para evitar flash de SSR). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
