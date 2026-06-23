"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getModule, roman } from "@/lib/ancord/modules";
import { questionsByModule } from "@/lib/ancord/questions";
import { flashcardsByModule } from "@/lib/ancord/flashcards";
import { moduleMastery } from "@/lib/ancord/plan";
import { useAncord, useHydrated } from "@/lib/ancord/store";
import { Bar, Card, CriticalBadge } from "../../_components/ui";

export default function ModuleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const m = getModule(id);
  const p = useAncord();
  const hydrated = useHydrated();

  if (!m) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500">Capítulo não encontrado.</p>
        <Link href="/ancord/modulos" className="mt-3 inline-block text-brand-600">← Voltar aos módulos</Link>
      </div>
    );
  }

  const data = hydrated ? moduleMastery(p).find((x) => x.moduleId === id) : undefined;
  const mastery = data ? Math.round(data.mastery * 100) : 0;
  const nQ = questionsByModule(id).length;
  const nF = flashcardsByModule(id).length;

  return (
    <div className="space-y-4">
      <Link href="/ancord/modulos" className="text-sm text-gray-400">← Módulos</Link>

      <header className="flex items-start gap-3">
        <span className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-base font-bold text-brand-600">
          {roman(m.id)}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold leading-tight text-gray-900">{m.title}</h1>
          </div>
          {m.critical && <div className="mt-1"><CriticalBadge /></div>}
        </div>
      </header>

      {hydrated && data && data.seen > 0 && (
        <div className="flex items-center gap-2">
          <Bar value={mastery} tone={mastery >= 70 ? "green" : "brand"} />
          <span className="text-xs font-medium text-gray-400">{mastery}% · {data.seen} respondidas</span>
        </div>
      )}

      {/* Microlição / resumo */}
      <Card>
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-500">Resumo relâmpago</h2>
        <p className="text-sm leading-relaxed text-gray-700">{m.summary}</p>
      </Card>

      <Card>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">O que cai</h2>
        <ul className="space-y-1.5">
          {m.topics.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-brand-400">•</span>
              {t}
            </li>
          ))}
        </ul>
      </Card>

      {/* Ações */}
      <div className="space-y-2">
        <Link
          href={`/ancord/estudar?modo=questoes&modulo=${m.id}`}
          className="flex items-center justify-between rounded-xl bg-brand-500 px-4 py-3.5 text-sm font-semibold text-white"
        >
          <span>⚡ Treinar {nQ} questões deste capítulo</span>
          <span>›</span>
        </Link>
        <Link
          href={`/ancord/estudar?modo=revisao&modulo=${m.id}`}
          className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold text-gray-800"
        >
          <span>🧠 Revisar {nF} flashcards</span>
          <span>›</span>
        </Link>
        <Link
          href={`/ancord/tutor?modulo=${m.id}`}
          className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold text-gray-800"
        >
          <span>🤖 Pedir explicação ao tutor</span>
          <span>›</span>
        </Link>
      </div>
    </div>
  );
}
