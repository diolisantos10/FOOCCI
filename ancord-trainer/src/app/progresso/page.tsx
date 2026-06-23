"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { roman, getModule } from "@/lib/modules";
import { moduleMastery, readiness } from "@/lib/plan";
import {
  useAncord,
  useHydrated,
  setExamDate,
  setDailyGoal,
  exportJSON,
  importJSON,
  resetAll,
} from "@/lib/store";
import { daysUntil } from "@/lib/storage";
import { Ring, Bar, Card, SectionTitle } from "../_components/ui";

export default function ProgressoPage() {
  const p = useAncord();
  const hydrated = useHydrated();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  if (!hydrated) return <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />;

  const ready = readiness(p);
  const mm = moduleMastery(p).slice().sort((a, b) => a.mastery - b.mastery);
  const totalMinutes = Object.values(p.daily).reduce((s, d) => s + d.minutes, 0);
  const daysStudied = Object.keys(p.daily).length;
  const dleft = daysUntil(p.examDate);

  function doExport() {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ancord-progresso-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importJSON(String(reader.result));
      setMsg(ok ? "✅ Progresso importado!" : "❌ Arquivo inválido.");
      setTimeout(() => setMsg(""), 3000);
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Seu progresso</h1>
        <Link href="/" className="text-sm text-gray-400">Início</Link>
      </header>

      <Card className="flex items-center gap-4">
        <Ring value={ready} sub="pronto" />
        <div className="grid flex-1 grid-cols-2 gap-3 text-center">
          <Stat label="🔥 Ofensiva" value={`${p.streak.current}`} sub={`recorde ${p.streak.best}`} />
          <Stat label="⭐ XP" value={`${p.xp}`} />
          <Stat label="⏱️ Tempo" value={`${Math.round(totalMinutes / 60)}h`} sub={`${totalMinutes} min`} />
          <Stat label="📅 Dias" value={`${daysStudied}`} sub="estudados" />
        </div>
      </Card>

      {/* Histórico de simulados */}
      <section>
        <SectionTitle>Simulados ({p.exams.length})</SectionTitle>
        {p.exams.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500">Nenhum simulado ainda.</p>
            <Link href="/simulado?modo=full" className="mt-2 inline-block text-sm font-semibold text-brand-600">
              Fazer o primeiro →
            </Link>
          </Card>
        ) : (
          <div className="space-y-2">
            {p.exams.slice().reverse().slice(0, 8).map((e, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-3">
                <div>
                  <p className={`text-sm font-bold ${e.passed ? "text-green-600" : "text-red-500"}`}>
                    {e.passed ? "Aprovado" : "Reprovado"} · {Math.round(e.scorePct * 100)}%
                  </p>
                  <p className="text-xs text-gray-400">
                    {e.correct}/{e.total} · {new Date(e.ts).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="text-2xl">{e.passed ? "🏆" : "📚"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Domínio por módulo (mais fraco primeiro) */}
      <section>
        <SectionTitle>Domínio por capítulo · do mais fraco ao mais forte</SectionTitle>
        <Card>
          <div className="space-y-2.5">
            {mm.map((d) => {
              const mod = getModule(d.moduleId)!;
              const v = Math.round(d.mastery * 100);
              return (
                <Link key={d.moduleId} href={`/modulos/${d.moduleId}`} className="block">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="font-bold text-gray-400">{roman(d.moduleId)}</span>
                      {mod.short}
                      {d.critical && <span className="text-red-500">⚠️</span>}
                    </span>
                    <span className="font-semibold text-gray-500">{v}%</span>
                  </div>
                  <Bar value={v} tone={v >= 70 ? "green" : d.critical && v < 50 ? "red" : "brand"} />
                </Link>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Configurações */}
      <section>
        <SectionTitle>Configurações</SectionTitle>
        <Card className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">
              📅 Data da prova {dleft != null && dleft >= 0 ? `· faltam ${dleft} dias` : ""}
            </span>
            <input
              type="date"
              value={p.examDate ?? ""}
              onChange={(e) => setExamDate(e.target.value || null)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-gray-700">⏱️ Meta diária: {p.dailyGoalMinutes} min</span>
            <input
              type="range"
              min={15}
              max={120}
              step={5}
              value={p.dailyGoalMinutes}
              onChange={(e) => setDailyGoal(Number(e.target.value))}
              className="mt-2 w-full accent-brand-500"
            />
          </label>

          <div className="border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs text-gray-400">
              Seus dados ficam só neste aparelho. Faça backup para não perder o progresso.
            </p>
            <div className="flex gap-2">
              <button onClick={doExport} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700">
                ⬇️ Exportar
              </button>
              <button onClick={() => fileRef.current?.click()} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700">
                ⬆️ Importar
              </button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={doImport} />
            </div>
            {msg && <p className="mt-2 text-center text-xs font-medium">{msg}</p>}
            <button
              onClick={() => {
                if (confirm("Apagar TODO o progresso? Esta ação não pode ser desfeita.")) resetAll();
              }}
              className="mt-2 w-full rounded-xl py-2.5 text-xs font-semibold text-red-500"
            >
              Zerar todo o progresso
            </button>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-2 py-2">
      <p className="text-[10px] font-medium text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}
