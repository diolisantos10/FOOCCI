"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ExamResult } from "@/lib/ancord/types";
import {
  buildExam,
  displayOptions,
  scoreExam,
  type ExamItem,
  type ExamMode,
} from "@/lib/ancord/exam";
import { MODULES, roman, PASS_PCT, CRITICAL_MIN_PCT } from "@/lib/ancord/modules";
import { recordExam, useHydrated } from "@/lib/ancord/store";
import { Bar, Card, CriticalBadge } from "../_components/ui";

function fmt(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function limitSeconds(mode: ExamMode, n: number): number {
  if (mode === "full") return 150 * 60; // 2h30
  if (mode === "quick") return 30 * 60;
  return Math.max(5, n) * 60; // 1 min/questão por módulo
}

function Config({ onStart }: { onStart: (mode: ExamMode, moduleId?: number) => void }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Simulado</h1>
        <p className="text-sm text-gray-500">Treine no formato da prova. Aprovação: 70% no geral + 50% em cada capítulo crítico.</p>
      </header>

      <div className="space-y-2">
        <button
          onClick={() => onStart("full")}
          className="w-full rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 p-5 text-left text-white shadow-sm"
        >
          <p className="text-lg font-bold">📝 Simulado completo</p>
          <p className="text-sm text-white/80">80 questões · 2h30 · regra real de aprovação</p>
        </button>

        <button
          onClick={() => onStart("quick")}
          className="w-full rounded-2xl border border-gray-200 bg-white p-5 text-left hover:border-brand-300"
        >
          <p className="text-lg font-bold text-gray-900">🎯 Mini-simulado</p>
          <p className="text-sm text-gray-500">20 questões · 30 min · treino rápido</p>
        </button>
      </div>

      <div>
        <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-gray-400">Por capítulo</h2>
        <div className="grid grid-cols-1 gap-2">
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => onStart("module", m.id)}
              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left hover:border-brand-200"
            >
              <span className="flex h-7 w-9 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-600">
                {roman(m.id)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{m.short}</span>
              {m.critical && <CriticalBadge />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Running({
  items,
  mode,
  onFinish,
}: {
  items: ExamItem[];
  mode: ExamMode;
  onFinish: (answers: (number | null)[], durationSec: number) => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => items.map(() => null));
  const [cur, setCur] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const start = useRef(Date.now());
  const limit = limitSeconds(mode, items.length);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.floor((Date.now() - start.current) / 1000);
  const remaining = limit - elapsed;

  useEffect(() => {
    if (remaining <= 0) onFinish(answers, elapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining <= 0]);

  const item = items[cur]!;
  const { options } = displayOptions(item);
  const answeredCount = answers.filter((a) => a != null).length;

  function choose(i: number) {
    setAnswers((prev) => {
      const copy = prev.slice();
      copy[cur] = i;
      return copy;
    });
  }

  return (
    <div className="flex min-h-[85vh] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-gray-400">Questão {cur + 1}/{items.length}</span>
        <span
          className={`tabular-nums rounded-full px-3 py-1 text-sm font-bold ${
            remaining < 300 ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-700"
          }`}
        >
          ⏱ {fmt(remaining)}
        </span>
      </div>
      <Bar value={((cur + 1) / items.length) * 100} />

      <div className="mt-5 flex-1">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-500">
            Cap. {roman(item.q.moduleId)}
          </p>
          <p className="mt-2 text-base font-semibold leading-snug text-gray-900">{item.q.stem}</p>
        </div>
        <div className="mt-3 space-y-2">
          {options.map((opt, i) => {
            const sel = answers[cur] === i;
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  sel ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white hover:border-brand-300"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    sel ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="text-gray-800">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navegação */}
      <div className="sticky bottom-20 mt-4 flex items-center gap-2">
        <button
          onClick={() => setCur((c) => Math.max(0, c - 1))}
          disabled={cur === 0}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 disabled:opacity-40"
        >
          ←
        </button>
        <button
          onClick={() => setShowGrid((s) => !s)}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600"
        >
          {answeredCount}/{items.length} respondidas
        </button>
        {cur + 1 < items.length ? (
          <button
            onClick={() => setCur((c) => Math.min(items.length - 1, c + 1))}
            className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white"
          >
            →
          </button>
        ) : (
          <button
            onClick={() => onFinish(answers, elapsed)}
            className="rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white"
          >
            Finalizar
          </button>
        )}
      </div>

      {showGrid && (
        <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-3">
          <div className="grid grid-cols-8 gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setCur(i);
                  setShowGrid(false);
                }}
                className={`flex h-8 items-center justify-center rounded-md text-xs font-semibold ${
                  i === cur
                    ? "bg-brand-500 text-white"
                    : answers[i] != null
                      ? "bg-brand-100 text-brand-700"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={() => onFinish(answers, elapsed)}
            className="mt-3 w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white"
          >
            Finalizar agora ({answeredCount}/{items.length})
          </button>
        </div>
      )}
    </div>
  );
}

function Result({
  result,
  items,
  answers,
  onRestart,
}: {
  result: ExamResult;
  items: ExamItem[];
  answers: (number | null)[];
  onRestart: () => void;
}) {
  const [review, setReview] = useState(false);
  const pct = Math.round(result.scorePct * 100);

  return (
    <div className="space-y-4">
      <div
        className={`rounded-3xl p-6 text-center text-white shadow-sm ${
          result.passed ? "bg-gradient-to-br from-green-500 to-green-600" : "bg-gradient-to-br from-red-500 to-red-600"
        }`}
      >
        <div className="text-5xl">{result.passed ? "🏆" : "📚"}</div>
        <h1 className="mt-2 text-2xl font-bold">{result.passed ? "Aprovado!" : "Ainda não passou"}</h1>
        <p className="mt-1 text-white/90">
          {result.correct}/{result.total} acertos · {pct}%
        </p>
        <p className="mt-1 text-xs text-white/70">
          Necessário: {Math.round(PASS_PCT * 100)}% no geral e {Math.round(CRITICAL_MIN_PCT * 100)}% em cada crítico
        </p>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-bold text-gray-700">Desempenho por capítulo</h2>
        <div className="space-y-2.5">
          {MODULES.filter((m) => result.perModule[m.id]).map((m) => {
            const pm = result.perModule[m.id]!;
            const acc = pm.total > 0 ? pm.correct / pm.total : 0;
            const failCrit = m.critical && acc < CRITICAL_MIN_PCT;
            return (
              <div key={m.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <span className="font-bold text-gray-400">{roman(m.id)}</span>
                    {m.short}
                    {m.critical && <span className="text-red-500">⚠️</span>}
                  </span>
                  <span className={`font-semibold ${failCrit ? "text-red-600" : "text-gray-700"}`}>
                    {pm.correct}/{pm.total}
                  </span>
                </div>
                <Bar value={acc * 100} tone={failCrit ? "red" : acc >= 0.7 ? "green" : "brand"} />
              </div>
            );
          })}
        </div>
      </Card>

      <button
        onClick={() => setReview((r) => !r)}
        className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700"
      >
        {review ? "Ocultar correção" : "Revisar questões erradas e acertos"}
      </button>

      {review && (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const { options, correct } = displayOptions(item);
            const chosen = answers[idx];
            const ok = chosen === correct;
            return (
              <div key={idx} className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-500">
                  {idx + 1}. Cap. {roman(item.q.moduleId)} {ok ? "✅" : "❌"}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{item.q.stem}</p>
                <div className="mt-2 space-y-1 text-sm">
                  {options.map((opt, i) => (
                    <p
                      key={i}
                      className={`rounded-lg px-2 py-1 ${
                        i === correct
                          ? "bg-green-50 text-green-800"
                          : i === chosen
                            ? "bg-red-50 text-red-700"
                            : "text-gray-500"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}. {opt}
                    </p>
                  ))}
                </div>
                <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">💡 {item.q.explanation}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onRestart} className="flex-1 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white">
          Novo simulado
        </button>
        <Link href="/ancord" className="flex-1 rounded-xl border border-gray-200 py-3 text-center text-sm font-semibold text-gray-700">
          Início
        </Link>
      </div>
    </div>
  );
}

function SimuladoFlow() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const initialMode = (params.get("modo") as ExamMode | null) ?? null;

  const [phase, setPhase] = useState<"config" | "running" | "result">(
    initialMode === "full" || initialMode === "quick" ? "running" : "config",
  );
  const [items, setItems] = useState<ExamItem[]>(() =>
    initialMode === "full" || initialMode === "quick" ? buildExam({ mode: initialMode }) : [],
  );
  const [mode, setMode] = useState<ExamMode>(initialMode ?? "quick");
  const [result, setResult] = useState<ExamResult | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  function start(m: ExamMode, moduleId?: number) {
    setMode(m);
    setItems(buildExam({ mode: m, moduleId }));
    setResult(null);
    setPhase("running");
    window.scrollTo(0, 0);
  }

  function finish(ans: (number | null)[], durationSec: number) {
    const r = scoreExam({ items, answers: ans, durationSec });
    recordExam(r);
    setAnswers(ans);
    setResult(r);
    setPhase("result");
    window.scrollTo(0, 0);
  }

  if (!hydrated) return <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />;

  if (phase === "running") return <Running items={items} mode={mode} onFinish={finish} />;
  if (phase === "result" && result)
    return <Result result={result} items={items} answers={answers} onRestart={() => setPhase("config")} />;
  return <Config onStart={start} />;
}

export default function SimuladoPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-gray-100" />}>
      <SimuladoFlow />
    </Suspense>
  );
}
