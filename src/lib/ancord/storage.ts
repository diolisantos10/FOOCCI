import type { Progress } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Persistência local (localStorage). Estado 100% no aparelho do usuário —
// sem banco, sem login, funciona offline. Inclui export/import em JSON para o
// usuário não perder o progresso ao trocar de aparelho.
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEY = "ancord-trainer:v1";
const CURRENT_VERSION = 1;

export function defaultProgress(): Progress {
  return {
    version: CURRENT_VERSION,
    createdAt: Date.now(),
    examDate: null,
    dailyGoalMinutes: 30,
    xp: 0,
    streak: { current: 0, best: 0, lastStudyDay: null },
    moduleStats: {},
    srs: {},
    attempts: [],
    daily: {},
    exams: [],
    onboarded: false,
  };
}

export function loadProgress(): Progress {
  if (typeof window === "undefined") return defaultProgress();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    // Merge com o default para tolerar versões antigas / campos ausentes.
    return { ...defaultProgress(), ...parsed, version: CURRENT_VERSION };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p: Progress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* armazenamento cheio / indisponível — ignora silenciosamente */
  }
}

// ── Datas (local) ────────────────────────────────────────────────────────────

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const target = new Date(isoDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return diff;
}

export function diffInDays(aKey: string, bKey: string): number {
  const a = new Date(aKey + "T00:00:00").getTime();
  const b = new Date(bKey + "T00:00:00").getTime();
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}
