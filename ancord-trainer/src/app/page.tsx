"use client";

import { useState } from "react";
import Link from "next/link";
import { useAncord, useHydrated, completeOnboarding } from "@/lib/store";
import { daysUntil, todayKey } from "@/lib/storage";
import { buildDailyPlan, readiness } from "@/lib/plan";
import { getModule } from "@/lib/modules";
import { Ring, Bar, Card, SectionTitle } from "./_components/ui";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function Onboarding() {
  const suggested = new Date();
  suggested.setDate(suggested.getDate() + 45);
  const [date, setDate] = useState(todayKey(suggested));
  const [goal, setGoal] = useState(45);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-1 text-3xl">🎯</div>
        <h1 className="text-xl font-bold text-gray-900">Bora passar na ANCORD</h1>
        <p className="mt-1 text-sm text-gray-500">
          Seu treinador pessoal para a prova de Assessor de Investimento. Modo intensivo, feito
          para foco curto e progresso visível.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">📅 Data da prova</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <span className="mt-1 block text-xs text-gray-400">
              Pode mudar depois. Sem data marcada? Deixe a sugestão (~45 dias).
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-gray-700">⏱️ Meta diária: {goal} min</span>
            <input
              type="range"
              min={15}
              max={120}
              step={5}
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
              className="mt-2 w-full accent-brand-500"
            />
          </label>
        </div>

        <button
          onClick={() => completeOnboarding(date || null, goal)}
          className="mt-6 w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Começar a treinar
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const p = useAncord();
  const hydrated = useHydrated();

  if (!hydrated) {
    return <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />;
  }

  if (!p.onboarded) return <Onboarding />;

  const plan = buildDailyPlan(p);
  const ready = readiness(p);
  const dleft = daysUntil(p.examDate);
  const focus = getModule(plan.focusModuleId);
  const goalPct = p.dailyGoalMinutes > 0 ? (plan.minutesToday / p.dailyGoalMinutes) * 100 : 0;
  const doneCount = plan.tasks.filter((t) => t.complete).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400">{greeting()} 👋</p>
          <h1 className="text-2xl font-bold text-gray-900">Plano de hoje</h1>
        </div>
        <Link
          href="/progresso"
          className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-bold text-brand-600"
        >
          🔥 {p.streak.current}
        </Link>
      </header>

      {/* Resumo: prontidão + contagem */}
      <Card className="flex items-center gap-4">
        <Ring value={ready} sub="pronto" />
        <div className="flex-1">
          {dleft != null ? (
            <p className="text-sm text-gray-500">
              {dleft > 0 ? (
                <>
                  Faltam <span className="text-lg font-bold text-gray-900">{dleft}</span> dias para a
                  prova
                </>
              ) : dleft === 0 ? (
                <span className="font-bold text-brand-600">É hoje! Você consegue 💪</span>
              ) : (
                <span className="text-gray-500">Defina uma nova data da prova nas configurações</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-500">Defina a data da prova no seu progresso</p>
          )}
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-gray-400">
              <span>Meta de hoje</span>
              <span>
                {plan.minutesToday}/{p.dailyGoalMinutes} min
              </span>
            </div>
            <Bar value={goalPct} tone={goalPct >= 100 ? "green" : "brand"} />
          </div>
        </div>
      </Card>

      {/* Foco do dia */}
      {focus && (
        <Link href={`/modulos/${focus.id}`} className="block">
          <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 p-4 text-white shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Foco do dia</p>
            <p className="mt-0.5 text-lg font-bold">{focus.title}</p>
            <p className="mt-1 text-sm text-white/80">
              {focus.critical ? "⚠️ Capítulo crítico — " : ""}toque para revisar o resumo
            </p>
          </div>
        </Link>
      )}

      {/* Tarefas */}
      <section>
        <SectionTitle>
          Suas tarefas · {doneCount}/{plan.tasks.length} concluídas
        </SectionTitle>
        <div className="space-y-2">
          {plan.tasks.map((t) => (
            <Link key={t.id} href={t.href} className="block">
              <div
                className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-colors ${
                  t.complete
                    ? "border-green-100 bg-green-50/50"
                    : "border-gray-100 bg-white hover:border-brand-200"
                }`}
              >
                <span className="text-2xl">{t.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${t.complete ? "text-green-700" : "text-gray-900"}`}>
                    {t.title}
                  </p>
                  <p className="truncate text-xs text-gray-400">{t.subtitle}</p>
                  {t.target > 1 && (
                    <div className="mt-1.5">
                      <Bar value={(t.done / t.target) * 100} tone={t.complete ? "green" : "brand"} />
                    </div>
                  )}
                </div>
                <span className="text-lg">{t.complete ? "✅" : "›"}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Atalhos */}
      <section>
        <SectionTitle>Atalhos</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/simulado?modo=full" className="rounded-2xl border border-gray-100 bg-white p-4 text-center hover:border-brand-200">
            <div className="text-2xl">📝</div>
            <p className="mt-1 text-sm font-semibold text-gray-800">Simulado 80q</p>
          </Link>
          <Link href="/estudar?modo=revisao" className="rounded-2xl border border-gray-100 bg-white p-4 text-center hover:border-brand-200">
            <div className="text-2xl">🧠</div>
            <p className="mt-1 text-sm font-semibold text-gray-800">Flashcards</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
