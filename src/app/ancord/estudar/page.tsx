"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Flashcard, Progress } from "@/lib/ancord/types";
import { QUESTIONS, questionsByModule } from "@/lib/ancord/questions";
import { FLASHCARDS, flashcardsByModule } from "@/lib/ancord/flashcards";
import { getModule, roman } from "@/lib/ancord/modules";
import { displayOptions, type ExamItem } from "@/lib/ancord/exam";
import { optionOrder, shuffle } from "@/lib/ancord/util";
import { isDue, type Grade } from "@/lib/ancord/srs";
import {
  useAncord,
  useHydrated,
  recordAnswer,
  reviewFlashcard,
  addStudyMinutes,
} from "@/lib/ancord/store";
import { Bar } from "../_components/ui";

function buildQuestionQueue(moduleId?: number): ExamItem[] {
  const base = moduleId ? questionsByModule(moduleId) : QUESTIONS;
  let qs = shuffle(base);
  if (!moduleId) qs = qs.slice(0, 20);
  return qs.map((q) => ({ q, order: optionOrder() }));
}

function buildCardQueue(p: Progress, moduleId?: number): Flashcard[] {
  const cards = moduleId ? flashcardsByModule(moduleId) : FLASHCARDS;
  const now = Date.now();
  const due = cards.filter((c) => {
    const st = p.srs[`f:${c.id}`];
    return st && isDue(st, now);
  });
  const fresh = cards.filter((c) => !p.srs[`f:${c.id}`]);
  const learned = cards.filter((c) => {
    const st = p.srs[`f:${c.id}`];
    return st && !isDue(st, now);
  });
  let queue = [...shuffle(due), ...shuffle(fresh).slice(0, 15)];
  if (queue.length === 0) queue = shuffle(learned).slice(0, 15);
  return queue;
}

function Timer({ start }: { start: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.floor((Date.now() - start) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="tabular-nums text-xs font-medium text-gray-400">{mm}:{ss}</span>;
}

const GRADES: { g: Grade; label: string; cls: string }[] = [
  { g: 0, label: "Errei", cls: "bg-red-50 text-red-600 hover:bg-red-100" },
  { g: 1, label: "Difícil", cls: "bg-orange-50 text-orange-600 hover:bg-orange-100" },
  { g: 2, label: "Bom", cls: "bg-blue-50 text-blue-600 hover:bg-blue-100" },
  { g: 3, label: "Fácil", cls: "bg-green-50 text-green-600 hover:bg-green-100" },
];

function StudySession() {
  const params = useSearchParams();
  const mode = params.get("modo") === "revisao" ? "revisao" : "questoes";
  const moduleId = params.get("modulo") ? Number(params.get("modulo")) : undefined;
  const mod = moduleId ? getModule(moduleId) : undefined;

  const p = useAncord();
  const hydrated = useHydrated();

  const sessionStart = useRef(Date.now());
  const qStart = useRef(Date.now());

  // Fila criada uma única vez (snapshot no início da sessão).
  const [queue] = useState(() =>
    mode === "revisao" ? buildCardQueue(p, moduleId) : buildQuestionQueue(moduleId),
  );

  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [hits, setHits] = useState(0);
  const [done, setDone] = useState(false);

  // Contabiliza o tempo de estudo ao sair.
  useEffect(() => {
    const started = sessionStart.current;
    return () => addStudyMinutes(Math.round((Date.now() - started) / 60000));
  }, []);

  const total = queue.length;

  if (!hydrated) return <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />;

  if (total === 0) {
    return (
      <Empty
        title="Tudo revisado por aqui! 🎉"
        subtitle={mode === "revisao" ? "Não há cards vencendo agora. Volte mais tarde ou treine questões." : "Sem questões para este recorte."}
      />
    );
  }

  function finish(extraHit = 0) {
    addStudyMinutes(Math.round((Date.now() - sessionStart.current) / 60000));
    setHits((h) => h + extraHit);
    setDone(true);
  }

  function next() {
    if (idx + 1 >= total) {
      finish();
    } else {
      setIdx(idx + 1);
      setRevealed(false);
      setChosen(null);
      qStart.current = Date.now();
    }
  }

  if (done) {
    return (
      <Summary
        mode={mode}
        hits={hits}
        total={total}
        moduleId={moduleId}
        elapsedSec={Math.floor((Date.now() - sessionStart.current) / 1000)}
      />
    );
  }

  const progress = (idx / total) * 100;

  return (
    <div className="flex min-h-[80vh] flex-col">
      {/* Topo */}
      <div className="mb-4 flex items-center justify-between">
        <Link href="/ancord" className="text-sm text-gray-400">
          ✕ Sair
        </Link>
        <Timer start={sessionStart.current} />
      </div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
        <span>
          {mode === "revisao" ? "Revisão" : "Questões"}
          {mod ? ` · Cap. ${roman(mod.id)}` : ""}
        </span>
        <span>
          {idx + 1}/{total} · ✅ {hits}
        </span>
      </div>
      <Bar value={progress} />

      <div className="mt-6 flex-1">
        {mode === "revisao" ? (
          <FlashcardView
            card={queue[idx] as Flashcard}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            onGrade={(g) => {
              reviewFlashcard((queue[idx] as Flashcard).id, g);
              next();
            }}
          />
        ) : (
          <QuestionView
            item={queue[idx] as ExamItem}
            chosen={chosen}
            onChoose={(i, correctDisplay) => {
              if (chosen != null) return;
              setChosen(i);
              const it = queue[idx] as ExamItem;
              const correct = i === correctDisplay;
              const fast = Date.now() - qStart.current < 12000;
              recordAnswer(it.q, correct, fast);
              if (correct) setHits((h) => h + 1);
            }}
            onNext={next}
          />
        )}
      </div>
    </div>
  );
}

function FlashcardView({
  card,
  revealed,
  onReveal,
  onGrade,
}: {
  card: Flashcard;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (g: Grade) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col justify-center rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-500">
          Cap. {roman(card.moduleId)}
        </p>
        <p className="mt-3 text-lg font-semibold text-gray-900">{card.front}</p>
        {revealed && (
          <>
            <div className="my-4 h-px bg-gray-100" />
            <p className="text-base text-gray-600">{card.back}</p>
          </>
        )}
      </div>

      <div className="mt-4">
        {!revealed ? (
          <button
            onClick={onReveal}
            className="w-full rounded-xl bg-gray-900 py-3.5 text-sm font-semibold text-white"
          >
            Mostrar resposta
          </button>
        ) : (
          <div>
            <p className="mb-2 text-center text-xs text-gray-400">Como foi lembrar?</p>
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map(({ g, label, cls }) => (
                <button
                  key={g}
                  onClick={() => onGrade(g)}
                  className={`rounded-xl py-3 text-xs font-semibold ${cls}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionView({
  item,
  chosen,
  onChoose,
  onNext,
}: {
  item: ExamItem;
  chosen: number | null;
  onChoose: (i: number, correctDisplay: number) => void;
  onNext: () => void;
}) {
  const { options, correct } = useMemo(() => displayOptions(item), [item]);
  const answered = chosen != null;

  return (
    <div className="flex h-full flex-col">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-500">
          Cap. {roman(item.q.moduleId)}
        </p>
        <p className="mt-2 text-base font-semibold leading-snug text-gray-900">{item.q.stem}</p>
      </div>

      <div className="mt-3 space-y-2">
        {options.map((opt, i) => {
          let cls = "border-gray-200 bg-white hover:border-brand-300";
          if (answered) {
            if (i === correct) cls = "border-green-400 bg-green-50";
            else if (i === chosen) cls = "border-red-400 bg-red-50";
            else cls = "border-gray-100 bg-white opacity-60";
          }
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => onChoose(i, correct)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${cls}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-gray-800">{opt}</span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-3">
          <div
            className={`rounded-xl p-3 text-sm ${
              chosen === correct ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            <p className="font-semibold">{chosen === correct ? "✅ Correto!" : "❌ Não foi dessa vez"}</p>
            <p className="mt-1 text-gray-700">{item.q.explanation}</p>
          </div>
          <button
            onClick={onNext}
            className="mt-3 w-full rounded-xl bg-brand-500 py-3.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}

function Summary({
  mode,
  hits,
  total,
  moduleId,
  elapsedSec,
}: {
  mode: string;
  hits: number;
  total: number;
  moduleId?: number;
  elapsedSec: number;
}) {
  const pctv = mode === "questoes" && total > 0 ? Math.round((hits / total) * 100) : null;
  const mins = Math.max(1, Math.round(elapsedSec / 60));
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <div className="text-5xl">{pctv != null && pctv >= 70 ? "🏆" : "💪"}</div>
      <h1 className="mt-3 text-2xl font-bold text-gray-900">Sessão concluída!</h1>
      {pctv != null ? (
        <p className="mt-1 text-gray-500">
          Você acertou <span className="font-bold text-gray-900">{hits}/{total}</span> ({pctv}%) em {mins} min
        </p>
      ) : (
        <p className="mt-1 text-gray-500">
          {total} cards revisados em {mins} min — repetição espaçada fazendo efeito 🧠
        </p>
      )}

      <div className="mt-8 w-full max-w-xs space-y-2">
        <Link
          href={mode === "revisao" ? "/ancord/estudar?modo=revisao" : `/ancord/estudar?modo=questoes${moduleId ? `&modulo=${moduleId}` : ""}`}
          className="block w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Continuar treinando
        </Link>
        <Link href="/ancord" className="block w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}

function Empty({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <div className="text-5xl">🎉</div>
      <h1 className="mt-3 text-xl font-bold text-gray-900">{title}</h1>
      <p className="mt-1 max-w-xs text-sm text-gray-500">{subtitle}</p>
      <div className="mt-6 flex gap-2">
        <Link href="/ancord/estudar?modo=questoes" className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white">
          Treinar questões
        </Link>
        <Link href="/ancord" className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">
          Início
        </Link>
      </div>
    </div>
  );
}

export default function EstudarPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-gray-100" />}>
      <StudySession />
    </Suspense>
  );
}
