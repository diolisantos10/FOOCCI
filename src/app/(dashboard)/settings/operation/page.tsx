"use client";

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Feedback, SaveButton, Toggle, PageCard, SectionHeading } from "../_shared";
import { DEFAULT_HOURS, type DayHoursInput } from "@/validators/settings";

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_FULL  = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const TIME_INPUT =
  "rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition";

export default function OperationPage() {
  const [hours, setHours] = useState<DayHoursInput[]>(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/hours").then(({ data }) => {
      if (Array.isArray(data) && data.length > 0) {
        const merged = DEFAULT_HOURS.map((def) => {
          const found = (data as DayHoursInput[]).find((d) => d.dayOfWeek === def.dayOfWeek);
          return found ?? def;
        });
        setHours(merged);
      }
      setLoading(false);
    });
  }, []);

  function updateDay(idx: number, patch: Partial<DayHoursInput>) {
    setHours((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function copyToWeekdays(source: DayHoursInput) {
    setHours((prev) =>
      prev.map((d) =>
        d.dayOfWeek >= 1 && d.dayOfWeek <= 5
          ? { ...d, isOpen: source.isOpen, openTime: source.openTime, closeTime: source.closeTime }
          : d
      )
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok, data } = await apiFetch("/api/settings/hours", "PUT", hours);
    if (ok) setSuccess("Horários salvos com sucesso.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  // Count open days for summary
  const openCount = hours.filter((h) => h.isOpen).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* Week grid */}
      <PageCard>
        <SectionHeading
          title="Horário de funcionamento"
          subtitle={`${openCount} de 7 dias abertos.`}
        />

        {/* Day pills quick-toggle */}
        <div className="mb-5 flex gap-2">
          {hours.map((day, idx) => (
            <button
              key={day.dayOfWeek}
              type="button"
              onClick={() => updateDay(idx, { isOpen: !day.isOpen })}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                day.isOpen
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "bg-gray-100 text-gray-400 hover:bg-gray-200"
              }`}
            >
              {DAY_SHORT[day.dayOfWeek]}
            </button>
          ))}
        </div>

        {/* Hour rows */}
        <div className="divide-y divide-gray-50 overflow-hidden rounded-xl border border-gray-100">
          {hours.map((day, idx) => (
            <div
              key={day.dayOfWeek}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                day.isOpen ? "bg-white" : "bg-gray-50"
              }`}
            >
              {/* Day toggle */}
              <div className="w-28 shrink-0">
                <Toggle
                  label={DAY_FULL[day.dayOfWeek] ?? ""}
                  checked={day.isOpen}
                  onChange={(v) => updateDay(idx, { isOpen: v })}
                />
              </div>

              {/* Times */}
              {day.isOpen ? (
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="time"
                    value={day.openTime}
                    onChange={(e) => updateDay(idx, { openTime: e.target.value })}
                    className={TIME_INPUT}
                  />
                  <span className="text-xs text-gray-400">até</span>
                  <input
                    type="time"
                    value={day.closeTime}
                    onChange={(e) => updateDay(idx, { closeTime: e.target.value })}
                    className={TIME_INPUT}
                  />
                  {/* Copy to weekdays shortcut — show on weekdays */}
                  {day.dayOfWeek >= 1 && day.dayOfWeek <= 5 && (
                    <button
                      type="button"
                      onClick={() => copyToWeekdays(day)}
                      title="Copiar para todos os dias úteis"
                      className="ml-1 text-[10px] text-indigo-400 hover:text-indigo-600 underline"
                    >
                      copiar
                    </button>
                  )}
                </div>
              ) : (
                <span className="ml-auto text-xs font-medium text-gray-400">Fechado</span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-gray-400">
          Clique nos dias da semana acima para abrir/fechar rapidamente. Use &quot;copiar&quot; para replicar um horário a toda a semana útil.
        </p>
      </PageCard>

      <SaveButton saving={saving} />
    </form>
  );
}
