"use client";

import Link from "next/link";
import { MODULES, roman } from "@/lib/modules";
import { moduleMastery } from "@/lib/plan";
import { useAncord, useHydrated } from "@/lib/store";
import { Bar, CriticalBadge } from "../_components/ui";

export default function ModulosPage() {
  const p = useAncord();
  const hydrated = useHydrated();
  const mm = hydrated ? moduleMastery(p) : [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Módulos</h1>
        <p className="text-sm text-gray-500">15 capítulos do edital. Os 5 com ⚠️ exigem mínimo de 50% na prova.</p>
      </header>

      <div className="space-y-2">
        {MODULES.map((m) => {
          const data = mm.find((x) => x.moduleId === m.id);
          const mastery = data ? Math.round(data.mastery * 100) : 0;
          return (
            <Link key={m.id} href={`/modulos/${m.id}`} className="block">
              <div className="rounded-2xl border border-gray-100 bg-white p-4 hover:border-brand-200">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-600">
                    {roman(m.id)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{m.short}</p>
                      {m.critical && <CriticalBadge />}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{m.title}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Bar value={mastery} tone={mastery >= 70 ? "green" : "brand"} />
                      <span className="w-9 shrink-0 text-right text-xs font-medium text-gray-400">{mastery}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
