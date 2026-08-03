"use client";

/**
 * Tela da agenda: criar horários em lote (uma data + várias horas), listar os
 * próximos com estado livre/agendado, remover horário livre.
 *
 * Fuso: o input é interpretado no fuso do navegador do CEO (Brasília) e enviado
 * em ISO com offset — o banco guarda UTC e o site exibe em America/Sao_Paulo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

interface Slot {
  id:          string;
  startsAt:    string;
  durationMin: number;
  bookedAt:    string | null;
  nome:        string | null;
  whatsapp:    string | null;
  restaurante: string | null;
  notifiedAt:  string | null;
  notifyError: string | null;
}

const fmtDay = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit",
});
const fmtTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
});

function waLink(whatsapp: string): string | null {
  const digits = whatsapp.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

export function AgendaClient() {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<Slot[]>([]);
  const [pastBooked, setPastBooked] = useState<Slot[]>([]);

  // Formulário de criação em lote
  const [date, setDate]       = useState("");
  const [times, setTimes]     = useState("");
  const [duration, setDuration] = useState(20);
  const [saving, setSaving]   = useState(false);
  const [notice, setNotice]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/agenda");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar.");
      setUpcoming(json.data.upcoming);
      setPastBooked(json.data.pastBooked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar a agenda.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createSlots() {
    setNotice(null);
    setError(null);
    const hhmm = times
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const bad = hhmm.find((t) => !/^\d{1,2}:\d{2}$/.test(t));
    if (!date || hhmm.length === 0) { setError("Informe a data e ao menos um horário (ex.: 10:00, 14:30)."); return; }
    if (bad) { setError(`Horário inválido: "${bad}". Use o formato HH:MM.`); return; }

    // Interpreta no fuso do navegador (o CEO está em Brasília) e envia com offset.
    const slots = hhmm.map((t) => {
      const [h, m] = t.split(":").map(Number);
      const d = new Date(`${date}T00:00:00`);
      d.setHours(h!, m!, 0, 0);
      return { startsAt: d.toISOString(), durationMin: duration };
    });

    setSaving(true);
    try {
      const res = await fetch("/api/admin/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao criar.");
      const { created, skippedDuplicates } = json.data;
      setNotice(
        `${created} horário${created === 1 ? "" : "s"} criado${created === 1 ? "" : "s"}` +
        (skippedDuplicates > 0 ? ` · ${skippedDuplicates} já existia${skippedDuplicates === 1 ? "" : "m"}` : ""),
      );
      setTimes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar os horários.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSlot(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/agenda?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao remover.");
      setUpcoming((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover o horário.");
    }
  }

  // Agrupa os próximos por dia para leitura rápida.
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of upcoming) {
      const key = fmtDay.format(new Date(s.startsAt));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [upcoming]);

  const bookedCount = upcoming.filter((s) => s.bookedAt).length;

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Agenda de demonstrações</h1>
        <p className="mt-1 text-sm text-gray-400">
          Abra os horários em que você pode fazer a chamada curta de apresentação.
          O site (<code className="rounded bg-gray-800 px-1 text-gray-300">/site/agendar</code>) mostra
          só os livres; quem marcar aparece aqui com nome e WhatsApp.
        </p>
      </header>

      {/* Criação em lote */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Abrir horários</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Data</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <label className="block min-w-[220px] flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Horas (separadas por vírgula) — horário de Brasília
            </span>
            <input
              type="text"
              value={times}
              onChange={(e) => setTimes(e.target.value)}
              placeholder="10:00, 11:00, 14:30"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Duração</span>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value={15}>15 min</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
            </select>
          </label>
          <button
            type="button"
            onClick={createSlots}
            disabled={saving}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Criando…" : "Criar horários"}
          </button>
        </div>
        {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      {/* Lista dos próximos */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center text-sm text-gray-500">
          Carregando a agenda…
        </div>
      ) : upcoming.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <p className="text-base font-medium text-gray-700">Nenhum horário aberto.</p>
          <p className="mt-1 text-sm text-gray-500">
            Enquanto não houver horário livre, a página pública de agendamento
            oferece o formulário de contato no lugar.
          </p>
        </div>
      ) : (
        <section className="space-y-5">
          <p className="text-sm text-gray-400">
            <strong className="text-white">{upcoming.length}</strong> horário{upcoming.length === 1 ? "" : "s"} futuro{upcoming.length === 1 ? "" : "s"} ·{" "}
            <strong className="text-white">{bookedCount}</strong> agendado{bookedCount === 1 ? "" : "s"}
          </p>
          {byDay.map(([day, slots]) => (
            <div key={day} className="rounded-2xl border border-gray-200 bg-white">
              <p className="border-b border-gray-100 px-5 py-3 text-sm font-semibold capitalize text-gray-900">{day}</p>
              <ul className="divide-y divide-gray-100">
                {slots.map((s) => {
                  const wa = s.whatsapp ? waLink(s.whatsapp) : null;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="w-14 font-mono text-sm font-semibold text-gray-900">
                        {fmtTime.format(new Date(s.startsAt))}
                      </span>
                      <span className="text-xs text-gray-400">{s.durationMin} min</span>
                      {s.bookedAt ? (
                        <>
                          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                            agendado
                          </span>
                          <span className="text-sm font-medium text-gray-900">{s.nome}</span>
                          {s.whatsapp && (
                            wa ? (
                              <a href={wa} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-600 hover:underline">
                                {s.whatsapp}
                              </a>
                            ) : (
                              <span className="text-sm text-gray-700">{s.whatsapp}</span>
                            )
                          )}
                          {s.restaurante && <span className="text-sm text-gray-500">· {s.restaurante}</span>}
                          {!s.notifiedAt && (
                            <span className="text-xs text-amber-700" title={s.notifyError ?? undefined}>
                              aviso por e-mail não saiu
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                            livre
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSlot(s.id)}
                            className="ml-auto text-xs font-medium text-gray-400 transition-colors hover:text-red-600"
                          >
                            remover
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Histórico de reuniões passadas */}
      {pastBooked.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-200">Reuniões passadas</h2>
          <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {pastBooked.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm text-gray-600">
                <span className="capitalize">{fmtDay.format(new Date(s.startsAt))}</span>
                <span className="font-mono">{fmtTime.format(new Date(s.startsAt))}</span>
                <span className="font-medium text-gray-900">{s.nome}</span>
                {s.restaurante && <span className="text-gray-500">· {s.restaurante}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
