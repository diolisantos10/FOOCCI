"use client";

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Feedback, SaveButton, Toggle, PageCard, SectionHeading } from "../_shared";
import { DEFAULT_HOURS } from "@/validators/settings";

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_FULL  = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const TIME_INPUT =
  "rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition w-24";

interface Period {
  open:  string;
  close: string;
}

interface DayState {
  dayOfWeek: number;
  isOpen:    boolean;
  periods:   Period[];
}

function defaultPeriod(): Period {
  return { open: "09:00", close: "22:00" };
}

const DEFAULT_DAYS: DayState[] = DEFAULT_HOURS.map((h) => ({
  dayOfWeek: h.dayOfWeek,
  isOpen:    h.isOpen,
  periods:   [{ open: h.openTime, close: h.closeTime }],
}));

export default function OperationPage() {
  const [days, setDays]       = useState<DayState[]>(DEFAULT_DAYS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/hours").then(({ data }) => {
      if (Array.isArray(data) && data.length > 0) {
        const merged = DEFAULT_DAYS.map((def) => {
          const found = (data as Record<string, unknown>[]).find((d) => d.dayOfWeek === def.dayOfWeek);
          if (!found) return def;
          // API returns `periodsJson` (DB column name); saved payload uses `periods`.
          // Check both so that data round-trips correctly after a save/reload cycle.
          const rawPeriods =
            (Array.isArray(found.periodsJson) ? found.periodsJson : null) ??
            (Array.isArray(found.periods)     ? found.periods     : null);
          const periods: Period[] =
            rawPeriods && (rawPeriods as Period[]).length > 0
              ? (rawPeriods as Period[])
              : [{ open: (found.openTime as string) ?? "09:00", close: (found.closeTime as string) ?? "22:00" }];
          return { dayOfWeek: def.dayOfWeek, isOpen: !!found.isOpen, periods };
        });
        setDays(merged);
      }
      setLoading(false);
    });
  }, []);

  function toggleDay(idx: number, isOpen: boolean) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, isOpen } : d)));
  }

  function updatePeriod(dayIdx: number, periodIdx: number, patch: Partial<Period>) {
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== dayIdx) return d;
        const periods = d.periods.map((p, j) => (j === periodIdx ? { ...p, ...patch } : p));
        return { ...d, periods };
      })
    );
  }

  function addPeriod(dayIdx: number) {
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== dayIdx) return d;
        return { ...d, periods: [...d.periods, defaultPeriod()] };
      })
    );
  }

  function removePeriod(dayIdx: number, periodIdx: number) {
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== dayIdx || d.periods.length <= 1) return d;
        return { ...d, periods: d.periods.filter((_, j) => j !== periodIdx) };
      })
    );
  }

  function copyToWeekdays(source: DayState) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek >= 1 && d.dayOfWeek <= 5
          ? { ...d, isOpen: source.isOpen, periods: source.periods.map((p) => ({ ...p })) }
          : d
      )
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const payload = days.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isOpen:    d.isOpen,
      openTime:  d.periods[0]?.open  ?? "09:00",
      closeTime: d.periods[0]?.close ?? "22:00",
      periods:   d.periods,
    }));
    const { ok, data } = await apiFetch("/api/settings/hours", "PUT", payload);
    if (ok) setSuccess("Horários salvos com sucesso.");
    else setError((data as { error?: string })?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  const openCount = days.filter((d) => d.isOpen).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      <PageCard>
        <SectionHeading
          title="Horário de funcionamento"
          subtitle={`${openCount} de 7 dias abertos. Adicione múltiplos períodos para intervalo de almoço/jantar.`}
        />

        {/* Day pills quick-toggle */}
        <div className="mb-5 flex gap-2">
          {days.map((day, idx) => (
            <button
              key={day.dayOfWeek}
              type="button"
              onClick={() => toggleDay(idx, !day.isOpen)}
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

        {/* Day rows */}
        <div className="divide-y divide-gray-50 overflow-hidden rounded-xl border border-gray-100">
          {days.map((day, dayIdx) => (
            <div
              key={day.dayOfWeek}
              className={`px-4 py-3 transition-colors ${day.isOpen ? "bg-white" : "bg-gray-50"}`}
            >
              <div className="flex items-start gap-3">
                {/* Day toggle */}
                <div className="mt-0.5 w-28 shrink-0">
                  <Toggle
                    label={DAY_FULL[day.dayOfWeek] ?? ""}
                    checked={day.isOpen}
                    onChange={(v) => toggleDay(dayIdx, v)}
                  />
                </div>

                {day.isOpen ? (
                  <div className="ml-auto flex flex-col gap-2">
                    {/* Period list */}
                    {day.periods.map((period, periodIdx) => (
                      <div key={periodIdx} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={period.open}
                          onChange={(e) => updatePeriod(dayIdx, periodIdx, { open: e.target.value })}
                          className={TIME_INPUT}
                        />
                        <span className="text-xs text-gray-400">até</span>
                        <input
                          type="time"
                          value={period.close}
                          onChange={(e) => updatePeriod(dayIdx, periodIdx, { close: e.target.value })}
                          className={TIME_INPUT}
                        />
                        {/* Remove period — only when there's more than one */}
                        {day.periods.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePeriod(dayIdx, periodIdx)}
                            className="text-gray-300 hover:text-red-400 transition-colors text-sm leading-none"
                            title="Remover período"
                          >
                            ✕
                          </button>
                        )}
                        {/* Copy to weekdays — show on last period of weekdays */}
                        {periodIdx === day.periods.length - 1 && day.dayOfWeek >= 1 && day.dayOfWeek <= 5 && (
                          <button
                            type="button"
                            onClick={() => copyToWeekdays(day)}
                            title="Copiar todos os períodos para dias úteis"
                            className="ml-1 text-[10px] text-indigo-400 hover:text-indigo-600 underline"
                          >
                            copiar
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Add period button */}
                    <button
                      type="button"
                      onClick={() => addPeriod(dayIdx)}
                      className="self-start text-[11px] text-indigo-500 hover:text-indigo-700 underline"
                    >
                      + Adicionar período
                    </button>
                  </div>
                ) : (
                  <span className="ml-auto mt-1 text-xs font-medium text-gray-400">Fechado</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-gray-400">
          Use &quot;+ Adicionar período&quot; para restaurantes com intervalo (ex: almoço 11h–15h e jantar 18h–23h). Use &quot;copiar&quot; para replicar a toda a semana útil.
        </p>
      </PageCard>

      <SaveButton saving={saving} />
    </form>
  );
}
