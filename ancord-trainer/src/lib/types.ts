// ─────────────────────────────────────────────────────────────────────────────
// ANCORD Trainer — domain types
//
// Projeto independente dentro do repositório: um treinador de estudos para a
// prova ANCORD (Assessor de Investimentos, ex-AAI). Não compartilha nada com o
// app de restaurante — estado fica 100% no aparelho do usuário (localStorage).
// ─────────────────────────────────────────────────────────────────────────────

/** Os 15 módulos/capítulos do edital da ANCORD. */
export interface AncordModule {
  /** Número do capítulo (1..15) — exibido em romano na UI. */
  id: number;
  slug: string;
  /** Título completo do capítulo. */
  title: string;
  /** Rótulo curto para chips/cards. */
  short: string;
  /** Capítulos I, II, III, VIII e XV exigem nota mínima de 50%. */
  critical: boolean;
  /** Peso aproximado no simulado de 80 questões (soma = 80). */
  examQuestions: number;
  /** Tópicos principais cobrados. */
  topics: string[];
  /** Resumo de estudo (texto curto, formato de revisão rápida). */
  summary: string;
}

export type Difficulty = 1 | 2 | 3;

/** Questão objetiva de múltipla escolha (4 alternativas, como na prova). */
export interface Question {
  id: string;
  moduleId: number;
  difficulty: Difficulty;
  stem: string;
  /** Sempre 4 alternativas. */
  options: [string, string, string, string];
  /** Índice (0..3) da alternativa correta. */
  correct: number;
  /** Explicação curta do porquê — aparece na correção. */
  explanation: string;
  tags?: string[];
}

/** Flashcard de revisão (frente/verso) para repetição espaçada. */
export interface Flashcard {
  id: string;
  moduleId: number;
  front: string;
  back: string;
}

/** Estado SRS (repetição espaçada, algoritmo SM-2 simplificado) por card. */
export interface SrsState {
  id: string;
  ease: number; // fator de facilidade
  interval: number; // dias até a próxima revisão
  due: number; // epoch ms — quando volta a aparecer
  reps: number;
  lapses: number;
  lastSeen: number;
}

export interface AttemptLog {
  qid: string;
  moduleId: number;
  correct: boolean;
  ts: number;
}

export interface DailyActivity {
  minutes: number;
  questions: number;
  reviews: number;
}

export interface ModuleStat {
  seen: number;
  correct: number;
}

/** Resultado salvo de um simulado completo. */
export interface ExamResult {
  ts: number;
  total: number;
  correct: number;
  scorePct: number;
  passed: boolean;
  /** Acertos por módulo crítico + se passou no mínimo de 50%. */
  perModule: Record<number, { total: number; correct: number }>;
  durationSec: number;
}

/** Tudo que é persistido localmente. */
export interface Progress {
  version: number;
  createdAt: number;
  examDate: string | null; // ISO (yyyy-mm-dd)
  dailyGoalMinutes: number;
  xp: number;
  streak: { current: number; best: number; lastStudyDay: string | null };
  moduleStats: Record<number, ModuleStat>;
  srs: Record<string, SrsState>; // chave: "q:<id>" ou "f:<id>"
  attempts: AttemptLog[]; // histórico recente (limitado)
  daily: Record<string, DailyActivity>; // chave: yyyy-mm-dd
  exams: ExamResult[];
  onboarded: boolean;
}
